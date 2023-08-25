const path                = require('path');
const { spawn }           = require('child_process');
const { expect }          = require('chai');
const config              = require('../../../config');
const browserProviderPool = require('../../../../../lib/browser/provider/pool');
const BrowserConnection   = require('../../../../../lib/browser/connection');
const { createReporter }  = require('../../../utils/reporter');

const setNativeAutomationForRemoteConnection = require('../../../utils/set-native-automation-for-remote-connection');

let errors = null;

const reporter = createReporter({
    reportTestDone (name, testRunInfo) {
        errors = testRunInfo.errs;
    },
});

function createConnection (browser) {
    return browserProviderPool
        .getBrowserInfo(browser)
        .then(browserInfo => {
            const options = {
                disableMultipleWindows: false,
                nativeAutomation:       config.nativeAutomation,
                developmentMode:        config.devMode,
            };

            const connnection = new BrowserConnection(testCafe.browserConnectionGateway, browserInfo, false, options);

            connnection.initialize();

            return connnection;
        });
}

const initializeConnectionLowHeartbeatTimeout = connection => {
    connection.HEARTBEAT_TIMEOUT = 4000;
};

const initializeConnectionHangOnRestart = connection => {
    initializeConnectionLowHeartbeatTimeout(connection);

    connection.BROWSER_CLOSE_TIMEOUT = 10000;

    const closeBrowser = connection.provider.closeBrowser;

    connection.provider = new connection.provider.constructor(connection.provider.plugin);

    connection.provider.closeBrowser = connectionId => {
        return closeBrowser.call(connection.provider, connectionId)
            .then(() => {
                return new Promise(() => {});
            });
    };
};

function run (pathToTest, filter, initializeConnection = initializeConnectionLowHeartbeatTimeout) {
    const src          = path.join(__dirname, pathToTest);
    const browserNames = config.currentEnvironment.browsers.map(browser => browser.browserName || browser.alias);

    return Promise.all(browserNames.map(browser => createConnection(browser)))
        .then(connections => {
            connections.forEach(connection => initializeConnection(connection));

            return connections;
        })
        .then(connection => {
            const runner = testCafe.createRunner();

            if (config.nativeAutomation)
                setNativeAutomationForRemoteConnection(runner);

            return runner
                .src(src)
                .filter(testName => testName === filter)
                .reporter(reporter)
                .browsers(connection)
                .run({ disableNativeAutomation: !config.nativeAutomation });
        });
}

if (config.useLocalBrowsers) {
    // TODO: make tests stable for IE and Windows
    (config.hasBrowser('ie') ? describe.skip : describe)('Browser reconnect', function () {
        it('Should restart browser when it does not respond', function () {
            return run('./testcafe-fixtures/index-test.js', 'Should restart browser when it does not respond')
                .then(() => {
                    expect(errors.length).eql(0);
                });
        });

        it('Should log error on browser disconnect', function () {
            let errLog = '';

            return new Promise(resolve => {
                const proc = spawn(`node ${path.join(__dirname, 'run-log-error-on-disconnect-test.js')}`, { shell: true, env: { ...process.env, DEBUG: 'testcafe:hammerhead:*' } });

                proc.stderr.on('data', data => {
                    errLog += data.toString('utf-8');
                });

                proc.on('close', resolve);
            })
                .then(() => {
                    expect(errLog).contains('"chrome:headless" disconnected during test execution');
                });
        });

        it('Should raise reporter reportTaskDone event on browser disconnect', function () {

            let reporterLog = '';

            return new Promise(resolve => {
                const proc = spawn(`node ${path.join(__dirname, 'run-log-error-on-disconnect-test.js')}`, {
                    shell: true,
                    env:   {
                        ...process.env,
                        CUSTOM_REPORTER: true,
                    },
                });

                proc.stdout.on('data', data => {
                    reporterLog += data.toString('utf-8');
                });

                proc.stderr.on('data', () => {
                });

                proc.on('close', resolve);
            })
                .then(() => {
                    expect(reporterLog).eql('reportTaskDone');
                });
        });

        it('Should fail on 3 disconnects in one browser', function () {
            return run('./testcafe-fixtures/index-test.js', 'Should fail on 3 disconnects in one browser')
                .then(() => {
                    throw new Error('Test should have failed but it succeeded');
                })
                .catch(err => {
                    expect(err.message).contains('browser disconnected. If you did not close the browser yourself, browser performance or network issues may be at fault.');
                });
        });

        it('Should restart browser on timeout if the `closeBrowser` method hangs', function () {
            return run('./testcafe-fixtures/index-test.js', 'Should restart browser on timeout if the `closeBrowser` method hangs', initializeConnectionHangOnRestart)
                .then(() => {
                    expect(errors.length).eql(0);
                });
        });
    });
}

