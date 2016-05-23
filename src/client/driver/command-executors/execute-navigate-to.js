import hammerhead from '../deps/hammerhead';
import testCafeCore from '../deps/testcafe-core';
import DriverStatus from '../status';

var Promise = hammerhead.Promise;

var RequestBarrier    = testCafeCore.RequestBarrier;
var pageUnloadBarrier = testCafeCore.pageUnloadBarrier;


<<<<<<< 0c33665cd2a204c6cadd3d7734e34832fbe253fc:src/client/driver/command-executors/execute-navigate-to.js
export default function executeNavigateTo (command) {
    var xhrBarrier = new XhrBarrier();
=======
export default function executeNavigateToCommand (command) {
    var requestBarrier = new RequestBarrier();
>>>>>>> request barrier:src/client/driver/command-executors/execute-navigate-to-command.js

    hammerhead.navigateTo(command.url);

    return Promise.all([requestBarrier.wait(), pageUnloadBarrier.wait()])
        .then(() => new DriverStatus({ isCommandResult: true }))
        .catch(err => new DriverStatus({ isCommandResult: true, executionError: err }));
}
