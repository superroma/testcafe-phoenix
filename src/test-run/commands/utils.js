// -------------------------------------------------------------
// WARNING: this file is used by both the client and the server.
// Do not use any browser or node-specific API!
// -------------------------------------------------------------
import TYPE from './type';

export function isCommandRejectableByPageError (command) {
    return !isObservationCommand(command) && !isBrowserManipulationCommand(command) && !isServiceCommand(command) ||
           isRejectablePrepareBrowserManipulationCommand(command)
           && !isWindowSwitchingCommand(command);
}

function isClientFunctionCommand (command) {
    return command.type === TYPE.executeClientFunction ||
           command.type === TYPE.executeSelector;
}

function isObservationCommand (command) {
    return isClientFunctionCommand(command) ||
           command.type === TYPE.wait ||
           command.type === TYPE.assertion;
}

function isWindowSwitchingCommand (command) {
    return command.type === TYPE.switchToIframe || command.type === TYPE.switchToMainWindow;
}

export function canSetDebuggerBreakpointBeforeCommand (command) {
    return command.type !== TYPE.debug && !isClientFunctionCommand(command) && !isBrowserManipulationCommand(command) &&
           !isServiceCommand(command);
}

export function isBrowserManipulationCommand (command) {
    return command.type === TYPE.takeScreenshot ||
           command.type === TYPE.takeScreenshotOnFail ||
           command.type === TYPE.resizeWindow ||
           command.type === TYPE.resizeWindowToFitDevice ||
           command.type === TYPE.maximizeWindow;
}

function isRejectablePrepareBrowserManipulationCommand (command) {
    return command.type === TYPE.prepareBrowserManipulation &&
           (command.manipulationCommandType === TYPE.resizeWindow ||
            command.manipulationCommandType === TYPE.resizeWindowToFitDevice ||
            command.manipulationCommandType === TYPE.maximizeWindow);
}

function isServicePrepareBrowserManipulationCommand (command) {
    return command.type === TYPE.prepareBrowserManipulation &&
           command.manipulationCommandType === TYPE.takeScreenshotOnFail;
}

export function isServiceCommand (command) {
    return command.type === TYPE.testDone ||
           command.type === TYPE.takeScreenshotOnFail ||
           command.type === TYPE.showAssertionRetriesStatus ||
           command.type === TYPE.hideAssertionRetriesStatus ||
           command.type === TYPE.setBreakpoint ||
           isServicePrepareBrowserManipulationCommand(command);
}

export function isExecutableInTopWindowOnly (command) {
    return command.type === TYPE.testDone ||
           command.type === TYPE.prepareBrowserManipulation ||
           command.type === TYPE.switchToMainWindow ||
           command.type === TYPE.setNativeDialogHandler ||
           command.type === TYPE.getNativeDialogHistory ||
           command.type === TYPE.setTestSpeed ||
           command.type === TYPE.showAssertionRetriesStatus ||
           command.type === TYPE.hideAssertionRetriesStatus ||
           command.type === TYPE.setBreakpoint;
}

export function doesCommandRequireVisibleElement (command) {
    return command.type === TYPE.click ||
           command.type === TYPE.rightClick ||
           command.type === TYPE.doubleClick ||
           command.type === TYPE.hover ||
           command.type === TYPE.typeText ||
           command.type === TYPE.drag ||
           command.type === TYPE.dragToElement ||
           command.type === TYPE.selectText ||
           command.type === TYPE.selectEditableContent ||
           command.type === TYPE.selectTextAreaContent;
}
