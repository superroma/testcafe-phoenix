import { assertType, is } from '../../errors/runtime/type-assertions';
import handleTagArgs from '../../utils/handle-tag-args';
import TestingUnit from './testing-unit';
import wrapTestFunction from '../wrap-test-function';

export default class Fixture extends TestingUnit {
    constructor (testFile) {
        super(testFile);

        this.path = testFile.filename;

        this.pageUrl = 'about:blank';

        this.beforeEachFn = null;
        this.afterEachFn  = null;

        this.beforeFn = null;
        this.afterFn  = null;

        this.onEachPageFn = null;

        return this.apiOrigin;
    }

    _add (name, ...rest) {
        name = handleTagArgs(name, rest);

        assertType(is.string, 'apiOrigin', 'The fixture name', name);

        this.name                    = name;
        this.testFile.currentFixture = this;

        return this.apiOrigin;
    }

    _before$ (fn) {
        assertType(is.function, 'before', 'fixture.before hook', fn);

        this.beforeFn = fn;

        return this.apiOrigin;
    }

    _after$ (fn) {
        assertType(is.function, 'after', 'fixture.after hook', fn);

        this.afterFn = fn;

        return this.apiOrigin;
    }

    _beforeEach$ (fn) {
        assertType(is.function, 'beforeEach', 'fixture.beforeEach hook', fn);

        this.beforeEachFn = wrapTestFunction(fn);

        return this.apiOrigin;
    }

    _afterEach$ (fn) {
        assertType(is.function, 'afterEach', 'fixture.afterEach hook', fn);

        this.afterEachFn = wrapTestFunction(fn);

        return this.apiOrigin;
    }

    _onEachPage$ (fn) {
        assertType(is.function, 'onEachPage', 'fixture.onEachPage hook', fn);

        this.onEachPageFn = wrapTestFunction(fn);

        return this.apiOrigin;
    }
}

TestingUnit._makeAPIListForChildClass(Fixture);
