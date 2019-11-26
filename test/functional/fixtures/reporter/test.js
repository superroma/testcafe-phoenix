const expect = require('chai').expect;
const fs     = require('fs');

const {
    createSimpleTestStream,
    createAsyncTestStream,
    createSyncTestStream
} = require('../../utils/stream');

describe('Reporter', () => {
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;

    afterEach(() => {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stdoutWrite;
    });

    it('Should support several different reporters for a test run', function () {
        const stream1 = createSimpleTestStream();
        const stream2 = createSimpleTestStream();

        return runTests('testcafe-fixtures/index-test.js', 'Simple test', {
            only:     ['chrome'],
            reporter: [
                {
                    name:   'json',
                    output: stream1
                },
                {
                    name:   'list',
                    output: stream2
                }
            ]
        })
            .then(() => {
                expect(stream1.data).to.contains('Chrome');
                expect(stream1.data).to.contains('Reporter');
                expect(stream1.data).to.contains('Simple test');
                expect(stream2.data).to.contains('Chrome');
                expect(stream2.data).to.contains('Reporter');
                expect(stream2.data).to.contains('Simple test');
            });
    });

    it('Should wait until reporter stream is finished (GH-2502)', function () {
        const stream = createAsyncTestStream();

        const runOpts = {
            only:     ['chrome'],
            reporter: [
                {
                    name:   'json',
                    output: stream
                }
            ]
        };

        return runTests('testcafe-fixtures/index-test.js', 'Simple test', runOpts)
            .then(() => {
                expect(stream.finalCalled).to.be.ok;
            });
    });

    it('Should wait until reporter stream failed to finish (GH-2502)', function () {
        const stream = createAsyncTestStream({ shouldFail: true });

        const runOpts = {
            only:     ['chrome'],
            reporter: [
                {
                    name:   'json',
                    output: stream
                }
            ]
        };

        return runTests('testcafe-fixtures/index-test.js', 'Simple test', runOpts)
            .then(() => {
                expect(stream.finalCalled).to.be.ok;
            });
    });

    it('Should not close stdout when it is specified as a reporter stream (GH-3114)', function () {
        let streamFinished = false;

        process.stdout.write = () => {
            process.stdout.write = stdoutWrite;
        };

        process.stdout.on('finish', () => {
            streamFinished = false;
        });

        const runOpts = {
            only:     ['chrome'],
            reporter: [
                {
                    name:   'json',
                    output: process.stdout
                }
            ]
        };

        return runTests('testcafe-fixtures/index-test.js', 'Simple test', runOpts)
            .then(() => {
                process.stdout.write = stdoutWrite;

                expect(streamFinished).to.be.not.ok;
            });
    });

    it('Should not close stderr when it is specified as a reporter stream (GH-3114)', function () {
        let streamFinished = false;

        process.stderr.write = () => {
            process.stderr.write = stderrWrite;
        };

        process.stderr.on('finish', () => {
            streamFinished = false;
        });

        const runOpts = {
            only:     ['chrome'],
            reporter: [
                {
                    name:   'json',
                    output: process.stderr
                }
            ]
        };

        return runTests('testcafe-fixtures/index-test.js', 'Simple test', runOpts)
            .then(() => {
                process.stderr.write = stderrWrite;

                expect(streamFinished).to.be.not.ok;
            });
    });

    it('Should not close stdout when undefined is specified as a reporter stream (GH-3114)', function () {
        let streamFinished = false;

        process.stdout.write = () => {
            process.stdout.write = stdoutWrite;
        };

        process.stdout.on('finish', () => {
            streamFinished = false;
        });

        const runOpts = {
            only:     ['chrome'],
            reporter: [
                {
                    name:   'json',
                    output: void 0
                }
            ]
        };

        return runTests('testcafe-fixtures/index-test.js', 'Simple test', runOpts)
            .then(() => {
                expect(streamFinished).to.be.not.ok;
            });
    });

    it('Should not close tty streams (GH-3114)', function () {
        const stream = createAsyncTestStream({ shouldFail: true });

        stream.isTTY = true;

        const runOpts = {
            only:     ['chrome'],
            reporter: [
                {
                    name:   'json',
                    output: stream
                }
            ]
        };

        return runTests('testcafe-fixtures/index-test.js', 'Simple test', runOpts)
            .then(() => {
                expect(stream.finalCalled).to.be.not.ok;
            });
    });

    it('Should support filename as reporter output', () => {
        const testStream     = createSimpleTestStream();
        const reportFileName = 'list.report';

        return runTests('testcafe-fixtures/index-test.js', 'Simple test', {
            only:     ['chrome'],
            reporter: [
                {
                    name:   'list',
                    output: testStream
                },
                {
                    name:   'list',
                    output: reportFileName
                }
            ]
        })
            .then(() => {
                const reportDataFromFile = fs.readFileSync(reportFileName).toString();

                expect(testStream.data).eql(reportDataFromFile);

                fs.unlinkSync(reportFileName);
            });
    });

    it('Should work with streams that emit the "finish" event synchronously (GH-3209)', function () {
        const stream = createSyncTestStream();

        const runOpts = {
            only: ['chrome'],

            reporter: [
                {
                    name:   'json',
                    output: stream
                }
            ]
        };

        return runTests('testcafe-fixtures/index-test.js', 'Simple test', runOpts)
            .then(() => {
                expect(stream.finalCalled).to.be.ok;
            });
    });

    describe('Methods `test-run-command-start` and `test-run-command-done`', () => {
        function generateReport (log) {
            return function customReporter () {
                return {
                    async reportTaskStart () {},
                    async reportFixtureStart () {},
                    async reportTestDone () {},
                    async reportTaskDone () {},

                    async reportTestRunCommandStart ({ command }) {
                        if (command)
                            log.push(`start: ${command.type}`);
                    },

                    async reportTestRunCommandDone ({ command, err }) {
                        if (err)
                            log.push(`error: ${err.code}`);

                        if (command) {
                            log.push(`done: ${command.type}`);
                        }
                    }
                };
            };
        }

        it('Simple command', function () {
            const log = [];

            const runOpts = {
                only:     ['chrome'],
                reporter: generateReport(log)
            };

            return runTests('testcafe-fixtures/index-test.js', 'Simple command test', runOpts)
                .then(() => {
                    expect(log).eql(['start: click', 'done: click', 'start: test-done', 'done: test-done']);
                });
        });

        it('Simple command Error', function () {
            const log = [];

            const runOpts = {
                only:     ['chrome'],
                reporter: generateReport(log)
            };

            return runTests('testcafe-fixtures/index-test.js', 'Simple command err test', runOpts)
                .then(() => {
                    expect(log).eql([
                        'start: click',
                        'error: E24',
                        'done: click',
                        'start: test-done',
                        'done: test-done'
                    ]);
                });
        });

        it('Complex command', function () {
            const log = [];

            const runOpts = {
                only:     ['chrome'],
                reporter: generateReport(log)
            };

            return runTests('testcafe-fixtures/index-test.js', 'Complex command test', runOpts)
                .then(() => {
                    expect(log).eql([
                        'start: execute-client-function',
                        'done: execute-client-function',
                        'start: navigate-to',
                        'done: navigate-to',
                        'start: backup-storages',
                        'done: backup-storages',
                        'start: navigate-to',
                        'done: navigate-to',
                        'start: test-done',
                        'done: test-done'
                    ]);
                });
        });

        it('Complex nested command', function () {
            const log = [];

            const runOpts = {
                only:     ['chrome'],
                reporter: generateReport(log)
            };

            return runTests('testcafe-fixtures/index-test.js', 'Complex nested command test', runOpts)
                .then(() => {
                    expect(log).eql([
                        'start: execute-client-function',
                        'done: execute-client-function',
                        'start: navigate-to',
                        'done: navigate-to',
                        'start: click',
                        'done: click',
                        'start: backup-storages',
                        'done: backup-storages',
                        'start: navigate-to',
                        'done: navigate-to',
                        'start: test-done',
                        'done: test-done'
                    ]);
                });
        });

        it('Complex command sequence', function () {
            const log = [];

            const runOpts = {
                only:     ['chrome'],
                reporter: generateReport(log)
            };

            return runTests('testcafe-fixtures/index-test.js', 'Complex command sequence', runOpts)
                .then(() => {
                    expect(log).eql([
                        'start: useRole',
                        'start: execute-client-function',
                        'done: execute-client-function',
                        'start: navigate-to',
                        'done: navigate-to',
                        'start: backup-storages',
                        'done: backup-storages',
                        'start: navigate-to',
                        'done: navigate-to',
                        'done: useRole',

                        'start: useRole',
                        'start: execute-client-function',
                        'done: execute-client-function',
                        // NOTE: some extra `backup` command, because of role switching
                        'start: backup-storages',
                        'done: backup-storages',
                        'start: navigate-to',
                        'done: navigate-to',
                        'start: backup-storages',
                        'done: backup-storages',
                        'start: navigate-to',
                        'done: navigate-to',
                        'done: useRole',

                        'start: test-done',
                        'done: test-done'

                    ]);
                });
        });
    });
});
