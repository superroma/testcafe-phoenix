const { expect }                     = require('chai');
const config                         = require('../../../../config');
const { errorInEachBrowserContains } = require('../../../../assertion-helper');

// NOTE: we set selectorTimeout to a large value in some tests to wait for
// an iframe to load on the farm (it is fast locally but can take some time on the farm)

const IFRAME_SELECTOR_TIMEOUT             = 5000;
const TEST_WITH_IFRAME_RUN_OPTIONS        = { selectorTimeout: IFRAME_SELECTOR_TIMEOUT };
const TEST_WITH_IFRAME_FAILED_RUN_OPTIONS = {
    shouldFail:      true,
    selectorTimeout: IFRAME_SELECTOR_TIMEOUT,
};

const isRemoteTask = config.currentEnvironmentName === config.testingEnvironmentNames.mobileBrowsers;

// TODO: IMPORTANT: Azure test tasks hang when a role is used in a test, fix it immediately
(isRemoteTask ? describe.skip : describe)('[API] t.useRole()', function () {
    // TODO: stabilize the test in Firefox
    (config.hasBrowser('firefox') ? it.skip : it)('Should initialize and switch roles', function () {
        return runTests('./testcafe-fixtures/use-role-test.js', null, { only: 'chrome,firefox' });
    });

    it('Should switch to Role.anonymous()', function () {
        return runTests('./testcafe-fixtures/anonymous-role-test.js');
    });

    it('Should have clean configuration in role initializer', function () {
        return runTests('./testcafe-fixtures/configuration-test.js', 'Clear configuration', TEST_WITH_IFRAME_FAILED_RUN_OPTIONS)
            .catch(function (errs) {
                expect(errs[0]).contains('- Error in Role initializer - A native alert dialog was invoked');
                expect(errs[0]).contains('> 34 |    await t.click(showAlertBtn);');
            });
    });

    it('Should restore configuration after role initializer', function () {
        return runTests('./testcafe-fixtures/configuration-test.js', 'Restore configuration', TEST_WITH_IFRAME_RUN_OPTIONS);
    });

    it('Should preserve URL if option specified', function () {
        return runTests('./testcafe-fixtures/preserve-url-test.js', 'Preserve url test', TEST_WITH_IFRAME_RUN_OPTIONS);
    });

    describe('Should always reload role`s login url', () => {
        it('Hash-based navigation', () => {
            return runTests('./testcafe-fixtures/hash-based-navigation-test.js', null, { only: 'chrome' });
        });

        it('Test run url and roles`s login url are same', () => {
            return runTests('./testcafe-fixtures/same-url-test.js', null, { only: 'chrome' });
        });
    });

    describe('Errors', function () {
        it('Should fail all tests that use role with the initializer error', function () {
            return runTests('./testcafe-fixtures/init-error-test.js', null, {
                shouldFail: true,
                only:       'chrome,firefox',
            })
                .catch(function (errs) {
                    const testedBrowsers = config.currentEnvironment.browsers;

                    if (testedBrowsers.length === 1 && Array.isArray(errs))
                        errs = { [testedBrowsers[0].alias]: errs };

                    const browsers = Object.keys(errs);

                    expect(browsers.length).eql(config.currentEnvironment.browsers.length);

                    browsers.forEach(function (browser) {
                        expect(errs[browser].length).eql(2);

                        errs[browser].forEach(function (err) {
                            expect(err).contains('- Error in Role initializer - Error: Hey!');
                            expect(err).contains('>  5 |    throw new Error(\'Hey!\');');
                        });
                    });

                });
        });

        it('Should fail if role switched within initializer', function () {
            return runTests('./testcafe-fixtures/errors-test.js', 'Role switch in initializer', { shouldFail: true })
                .catch(function (errs) {
                    expect(errs[0]).contains('- Error in Role initializer - Role cannot be switched while another role is being initialized.');
                    expect(errs[0]).contains('> 4 |    await t.useRole(Role.anonymous());');
                });
        });

        it('Should throw error if useRole argument is not a Role', function () {
            return runTests('./testcafe-fixtures/errors-test.js', 'useRole argument', { shouldFail: true })
                .catch(function (errs) {
                    expect(errs[0]).contains('The "role" argument is expected to be a Role instance, but it was object.');
                    expect(errs[0]).contains('> 16 |    await t.useRole({});');
                });
        });

        it('Should fail if there error occurred while restoring configuration', function () {
            return runTests('./testcafe-fixtures/errors-test.js', 'Error restoring configuration', TEST_WITH_IFRAME_FAILED_RUN_OPTIONS)
                .catch(function (errs) {
                    expect(errs[0]).contains('- Error while restoring configuration after Role switch -');
                    expect(errs[0]).contains('The iframe in which the test is currently operating does not exist anymore.');
                    expect(errs[0]).contains('> 29 |        .useRole(Role.anonymous());');
                });
        });

        it('Should fail if an error occurred while switching to clean run (GH-5278)', function () {
            return runTests('./testcafe-fixtures/error-on-switching-to-clean-run-test.js', null, { shouldFail: true })
                .catch(function (errs) {
                    errorInEachBrowserContains(errs, 'Error in Role initializer - Failed to load the page at "https://non-existing-url.com/"', 0);
                    errorInEachBrowserContains(errs, 'Error in Role initializer - Failed to load the page at "https://non-existing-url.com/"', 1);
                });
        });
    });

    describe('URL is Role constructor', function () {
        it('Should throw "error in role initializer" without baseUrl and with relative path Role', () => {
            return runTests(
                './testcafe-fixtures/role-with-baseurl-test.js',
                'Should throw error in role initializer without baseUrl and with relative path Role',
                {
                    shouldFail: true,
                }
            )
                .catch(err => {
                    expect(err[0]).contains('You cannot specify relative login page URLs in the Role constructor without "baseUrl" in configuration file or cli command.');
                });
        });

        it('Should pass if `baseUrl` is set with relative path Role', () => {
            return runTests(
                './testcafe-fixtures/role-with-baseurl-test.js',
                'Use role with relative path and baseUrl',
                {
                    baseUrl: 'http://localhost:3000/',
                }
            );
        });

        it('Should pass if `baseUrl` is set with absolute path Role', () => {
            return runTests(
                './testcafe-fixtures/role-with-baseurl-test.js',
                'Use role with absolute path and baseUrl',
                {
                    baseUrl: 'http://localhost:3000/',
                }
            );
        });
    });
});
