import TestFileCompilerBase from '../../base';
import { GeneralError } from '../../../../errors/runtime';
import { RUNTIME_ERRORS } from '../../../../errors/types';
import TestFile from '../../../../api/structure/test-file';
import Fixture from '../../../../api/structure/fixture';
import Test from '../../../../api/structure/test';
import createCommandFromObject from '../../../../test-run/commands/from-object';
import { RawCommandCallsiteRecord } from '../../../../utils/raw-command-callsite-record';
import { isNil as isNullOrUndefined } from 'lodash';

const STUDIO_PROPERTY_NAMES = {
    studio:   'studio',
    selector: 'selector',
    note:     'note',
};

export default class RawTestFileCompiler extends TestFileCompilerBase {

    static _createTestFn (commands) {
        return async t => {
            for (let i = 0; i < commands.length; i++) {
                const {
                    callsite: initCallsite,
                    actionId,
                    ...commandObj
                } = commands[i];

                const callsite = actionId ? new RawCommandCallsiteRecord(actionId, commands) : initCallsite || actionId;

                try {
                    // NOTE: TestCafe Studio adds additional fields to the command object in RAW tests.
                    // They do not affect the execution of the command. Therefore, we should remove them before validation.
                    // We should change this mechanism in TestCafe Studio in the future to not add these properties to RAW tests.
                    RawTestFileCompiler._removeStudioRelatedProperties(commandObj);

                    const command = createCommandFromObject(commandObj, t.testRun);

                    await t.testRun.executeCommand(command, callsite);
                }
                catch (err) {
                    err.callsite = callsite;
                    err.actionId = actionId;
                    throw err;
                }
            }
        };
    }

    static _assignCommonTestingUnitProperties (src, dest) {
        if (src.pageUrl)
            dest.page(src.pageUrl);

        if (src.authCredentials)
            dest.httpAuth(src.authCredentials);

        /* eslint-disable no-unused-expressions */
        if (src.only)
            dest.only;

        if (src.skip)
            dest.skip;

        if (src.disablePageReloads)
            dest.disablePageReloads;

        if (src.enablePageReloads)
            dest.enablePageReloads;
        /* eslint-enable no-unused-expressions */
    }

    static _addTest (testFile, src, baseUrl) {
        const test = new Test(testFile, false, baseUrl);

        test(src.name, RawTestFileCompiler._createTestFn(src.commands));

        RawTestFileCompiler._assignCommonTestingUnitProperties(src, test);

        if (src.beforeCommands)
            test.before(RawTestFileCompiler._createTestFn(src.beforeCommands));

        if (src.afterCommands)
            test.after(RawTestFileCompiler._createTestFn(src.afterCommands));

        return test;
    }

    static _addFixture (testFile, src, baseUrl) {
        const fixture = new Fixture(testFile, baseUrl);

        fixture(src.name);

        RawTestFileCompiler._assignCommonTestingUnitProperties(src, fixture);

        if (src.beforeEachCommands)
            fixture.beforeEach(RawTestFileCompiler._createTestFn(src.beforeEachCommands));

        if (src.afterEachCommands)
            fixture.afterEach(RawTestFileCompiler._createTestFn(src.afterEachCommands));

        src.tests.forEach(testSrc => RawTestFileCompiler._addTest(testFile, testSrc, baseUrl));
    }

    static _removeStudioRelatedProperties (commandObj) {
        delete commandObj[STUDIO_PROPERTY_NAMES.studio];
        delete commandObj[STUDIO_PROPERTY_NAMES.note];

        const selectorValue = commandObj[STUDIO_PROPERTY_NAMES.selector];

        if (!isNullOrUndefined(selectorValue))
            return;

        delete commandObj['selector'];
    }

    _hasTests () {
        return true;
    }

    getSupportedExtension () {
        return '.testcafe';
    }

    compile (code, filename) {
        const testFile = new TestFile(filename);

        let data = null;

        try {
            data = JSON.parse(code);

            data.fixtures.forEach(fixtureSrc => RawTestFileCompiler._addFixture(testFile, fixtureSrc, this.baseUrl));

            return testFile.getTests();
        }
        catch (err) {
            throw new GeneralError(RUNTIME_ERRORS.cannotParseRawFile, filename, err.toString());
        }
    }
}
