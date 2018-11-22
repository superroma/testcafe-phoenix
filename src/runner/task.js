import { pull as remove } from 'lodash';
import Emittery from '../utils/async-emitter';
import BrowserJob from './browser-job';
import Screenshots from '../screenshots';
import WarningLog from '../notifications/warning-log';
import FixtureHookController from './fixture-hook-controller';

export default class Task extends Emittery {
    constructor (tests, browserConnectionGroups, proxy, opts) {
        super();

        this.running                 = false;
        this.browserConnectionGroups = browserConnectionGroups;
        this.tests                   = tests;
        this.opts                    = opts;
        this.screenshots             = new Screenshots(this.opts.screenshotPath, this.opts.screenshotPathPattern);
        this.warningLog              = new WarningLog();

        this.fixtureHookController = new FixtureHookController(tests, browserConnectionGroups.length);
        this.pendingBrowserJobs    = this._createBrowserJobs(proxy, this.opts);
    }

    _assignBrowserJobEventHandlers (job) {
        job.on('test-run-start', testRun => this.emit('test-run-start', testRun));

        job.on('test-run-done', async testRun => {
            await this.emit('test-run-done', testRun);

            if (this.opts.stopOnFirstFail && testRun.errs.length) {
                this.abort();
                await this.emit('done');
            }
        });

        job.on('start', async () => {
            if (!this.running) {
                this.running = true;
                await this.emit('start');
            }
        });

        job.on('done', async () => {
            await this.emit('browser-job-done', job);

            remove(this.pendingBrowserJobs, job);

            if (!this.pendingBrowserJobs.length)
                await this.emit('done');
        });
    }

    _createBrowserJobs (proxy, opts) {
        return this.browserConnectionGroups.map(browserConnectionGroup => {
            const job = new BrowserJob(this.tests, browserConnectionGroup, proxy, this.screenshots, this.warningLog, this.fixtureHookController, opts);

            this._assignBrowserJobEventHandlers(job);
            browserConnectionGroup.map(bc => bc.addJob(job));

            return job;
        });
    }

    // API
    abort () {
        this.pendingBrowserJobs.forEach(job => job.abort());
    }
}
