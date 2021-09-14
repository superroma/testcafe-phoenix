import { navigateTo, Promise } from '../deps/hammerhead';
import {
    RequestBarrier,
    ClientReqEmitter,
    pageUnloadBarrier,
} from '../deps/testcafe-core';

import DriverStatus from '../status';


export default async function executeNavigateTo (command) {
    try {
        const requestEmitter = new ClientReqEmitter();
        const requestBarrier = new RequestBarrier(requestEmitter);

        navigateTo(command.url, command.forceReload);

        await Promise.all([requestBarrier.wait(), pageUnloadBarrier.wait()]);

        return new DriverStatus({ isCommandResult: true });
    }
    catch (error) {
        return new DriverStatus({ isCommandResult: true, executionError: error });
    }
}
