import hammerhead from '../deps/hammerhead';
import { NativeDialogNotHandledError, UncaughtErrorInNativeDialogHandler } from '../../../shared/errors';
import ClientFunctionExecutor from '../command-executors/client-functions/client-function-executor';
import MESSAGE_TYPE from './messages';


const messageSandbox = hammerhead.eventSandbox.message;
const processScript  = hammerhead.processScript;
const nativeMethods  = hammerhead.nativeMethods;

const APPEARED_DIALOGS                  = 'testcafe|native-dialog-tracker|appeared-dialogs';
const UNEXPECTED_DIALOG                 = 'testcafe|native-dialog-tracker|unexpected-dialog';
const ERROR_IN_HANDLER                  = 'testcafe|native-dialog-tracker|error-in-handler';
const GETTING_PAGE_URL_PROCESSED_SCRIPT = processScript('window.location.href');
const NATIVE_DIALOG_TYPES               = ['alert', 'confirm', 'prompt', 'print'];

export default class NativeDialogTracker {
    constructor (contextStorage, { dialogHandler } = {}) {
        this.contextStorage = contextStorage;
        this.dialogHandler  = dialogHandler;

        this._init();
        this._initListening();

        if (this.dialogHandler)
            this.setHandler(dialogHandler);
    }

    get appearedDialogs () {
        let dialogs = this.contextStorage.getItem(APPEARED_DIALOGS);

        if (!dialogs) {
            dialogs              = [];
            this.appearedDialogs = dialogs;
        }

        return dialogs;
    }

    set appearedDialogs (dialog) {
        this.contextStorage.setItem(APPEARED_DIALOGS, dialog);
    }

    get unexpectedDialog () {
        return this.contextStorage.getItem(UNEXPECTED_DIALOG);
    }

    set unexpectedDialog (dialog) {
        this.contextStorage.setItem(UNEXPECTED_DIALOG, dialog);
    }

    get handlerError () {
        return this.contextStorage.getItem(ERROR_IN_HANDLER);
    }

    set handlerError (dialog) {
        this.contextStorage.setItem(ERROR_IN_HANDLER, dialog);
    }

    static _getPageUrl () {
        return nativeMethods.eval(GETTING_PAGE_URL_PROCESSED_SCRIPT);
    }

    _initListening () {
        messageSandbox.on(messageSandbox.SERVICE_MSG_RECEIVED_EVENT, e => {
            const msg = e.message;

            if (msg.type === MESSAGE_TYPE.appearedDialog)
                // eslint-disable-next-line no-restricted-properties
                this._addAppearedDialogs(msg.dialogType, msg.text, msg.url);

            else if (msg.type === MESSAGE_TYPE.unexpectedDialog && !this.unexpectedDialog)
                this.unexpectedDialog = { type: msg.dialogType, url: msg.url };

            else if (msg.type === MESSAGE_TYPE.handlerError && !this.handlerError)
                this._onHandlerError(msg.dialogType, msg.message, msg.url);
        });
    }

    _init () {
        hammerhead.on(hammerhead.EVENTS.beforeUnload, e => {
            if (e.prevented && !e.isFakeIEEvent) {
                if (this.dialogHandler) {
                    const handler = this._createDialogHandler('beforeunload');

                    handler(e.returnValue || '');
                }
                else
                    this._defaultDialogHandler('beforeunload');
            }

            // NOTE: we should save changes that could be made via 'shift' and 'push' methods.
            if (this.contextStorage)
                this.contextStorage.save();
        });

        this._setDefaultDialogHandlers();
    }

    _setDefaultDialogHandlers () {
        NATIVE_DIALOG_TYPES.forEach(dialogType => {
            window[dialogType] = () => this._defaultDialogHandler(dialogType);
        });

        this._setGeolocationDialogHandler(() => this._defaultDialogHandler('geolocation'));
    }

    _setGeolocationDialogHandler (handler) {
        const geolocation = window.navigator.geolocation;

        if (geolocation?.getCurrentPosition)
            geolocation.getCurrentPosition = handler;
    }

    _createDialogHandler (type) {
        return text => {
            const url = NativeDialogTracker._getPageUrl();

            this._addAppearedDialogs(type, text, url);

            const executor = new ClientFunctionExecutor(this.dialogHandler);
            let result     = null;

            try {
                result = executor.fn.apply(window, [type, text, url]);
            }
            catch (err) {
                this._onHandlerError(type, err.message || String(err), url);
            }

            return result;
        };
    }

    _createGeolocationHandler () {
        return (successCallback, failCallback) => {
            const type = 'geolocation';
            const url  = NativeDialogTracker._getPageUrl();

            const isFirstGeolocationRequest = !this.appearedDialogs.some(dialog => dialog.type === type && dialog.url === url);

            if (isFirstGeolocationRequest)
                this._addAppearedDialogs(type, void 0, url);

            const executor = new ClientFunctionExecutor(this.dialogHandler);
            let result     = null;

            try {
                result = executor.fn.apply(window, [type, void 0, url]);
            }
            catch (err) {
                this._onHandlerError(type, err.message || String(err), url);
            }

            if (result instanceof Error)
                failCallback(result);
            else
                successCallback(result);
        };
    }

    // Overridable methods
    _defaultDialogHandler (type) {
        const url = NativeDialogTracker._getPageUrl();

        this.unexpectedDialog = this.unexpectedDialog || { type, url };
    }

    _addAppearedDialogs (type, text, url) {
        this.appearedDialogs.splice(0, 0, { type, text, url });
    }

    _onHandlerError (type, message, url) {
        this.handlerError = this.handlerError || { type, message, url };
    }

    // API
    setHandler (dialogHandler) {
        this.dialogHandler = dialogHandler;

        NATIVE_DIALOG_TYPES.forEach(dialogType => {
            window[dialogType] = this.dialogHandler ?
                this._createDialogHandler(dialogType) :
                () => this._defaultDialogHandler(dialogType);
        });

        this._setGeolocationDialogHandler(this.dialogHandler
            ? this._createGeolocationHandler()
            : () => this._defaultDialogHandler('geolocation')
        );
    }

    getUnexpectedDialogError () {
        const unexpectedDialog = this.unexpectedDialog;
        const handlerError     = this.handlerError;

        this.unexpectedDialog = null;
        this.handlerError     = null;

        if (unexpectedDialog)
            return new NativeDialogNotHandledError(unexpectedDialog.type, unexpectedDialog.url);

        if (handlerError)
            return new UncaughtErrorInNativeDialogHandler(handlerError.type, handlerError.message, handlerError.url);

        return null;
    }
}
