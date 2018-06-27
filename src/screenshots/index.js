import { find } from 'lodash';
import moment from 'moment';
import Capturer from './capturer';
import PathPattern from './path-pattern';

export default class Screenshots {
    constructor (path, pattern) {
        this.enabled            = !!path;
        this.screenshotsPath    = path;
        this.screenshotsPattern = pattern;
        this.testEntries        = [];
        this.now                = moment();
    }

    _addTestEntry (test) {
        const testEntry = {
            test:        test,
            path:        this.screenshotsPath || '',
            screenshots: []
        };

        this.testEntries.push(testEntry);

        return testEntry;
    }

    _getTestEntry (test) {
        return find(this.testEntries, entry => entry.test === test);
    }

    _ensureTestEntry (test) {
        let testEntry = this._getTestEntry(test);

        if (!testEntry)
            testEntry = this._addTestEntry(test);

        return testEntry;
    }

    getScreenshotsInfo (test) {
        return this._getTestEntry(test).screenshots;
    }

    hasCapturedFor (test) {
        return this.getScreenshotsInfo(test).length > 0;
    }

    getPathFor (test) {
        return this._getTestEntry(test).path;
    }

    createCapturerFor (test, testIndex, quarantine, connection, warningLog) {
        const testEntry   = this._ensureTestEntry(test);
        const pathPattern = new PathPattern(this.screenshotsPattern, {
            testIndex,
            quarantineAttempt: quarantine ? quarantine.getNextAttemptNumber() : null,
            now:               this.now,
            fixture:           test.fixture.name,
            test:              test.name,
            parsedUserAgent:   connection.browserInfo.parsedUserAgent,
        });

        return new Capturer(this.screenshotsPath, testEntry, connection, pathPattern, warningLog);
    }
}
