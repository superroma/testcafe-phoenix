import ClientFunctionFactory from './client-function-factory';
import { replicatorForSelector } from './replicators';
import { ClientFunctionAPIError } from '../errors/runtime';
import MESSAGE from '../errors/runtime/message';
import { ExecuteHybridFunctionCommand } from '../test-run/commands';

export default class SelectorFactory extends ClientFunctionFactory {
    constructor (fn, dependencies, boundTestRun, callsiteNames) {
        super(fn, dependencies, boundTestRun, callsiteNames);
    }

    _getFnCode (fn) {
        var fnType = typeof fn;

        // TODO needs its own error and should accept strings
        if (fnType !== 'function')
            throw new ClientFunctionAPIError(this.callsiteNames.instantiation, this.callsiteNames.instantiation, MESSAGE.clientFunctionCodeIsNotAFunction, fnType);

        return fn.toString();
    }

    _createExecutionTestRunCommand (args) {
        // TODO needs its own command
        return new ExecuteHybridFunctionCommand(this.callsiteNames.instantiation, this.compiledFnCode, args, true);
    }

    _getReplicator () {
        return replicatorForSelector;
    }
}
