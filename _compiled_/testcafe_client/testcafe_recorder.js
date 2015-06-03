(function () {
    window.initTestCafeRecorder = function (window) {
        var HammerheadClient = window.HammerheadClient,
            TestCafeClient = window.TestCafeClient,
            document = window.document;

//NOTE: this jshint directive disables warning: "Value of '{a}' may be overwritten in IE 8 and earlier."
/*jshint -W002 */

TestCafeClient.define('Recorder.ElementPicker', function (require, exports) {
    var Hammerhead = HammerheadClient.get('Hammerhead'),
        $ = Hammerhead.$,
        Util = Hammerhead.Util,
        EventSandbox = Hammerhead.EventSandbox,
        EventSimulator = Hammerhead.EventSimulator,
        ShadowUI = Hammerhead.ShadowUI,
        MessageSandbox = Hammerhead.MessageSandbox,

        eventEmitter = new Util.EventEmitter(),
        RecorderUtil = require('Recorder.Util'),
        SelectorGenerator = require('Recorder.SelectorGenerator'),
        SharedConst = require('Shared.Const');

    //Const
    var ELEMENT_FRAME_CLASS = RecorderUtil.ELEMENT_PICKING_CLASSES.elementFrame,
        ELEMENT_FRAME_PART_CLASS = RecorderUtil.ELEMENT_PICKING_CLASSES.elementFramePart;

    //Globals
    var $recorder = null,

        $elementFrame = null,
        $divTop = null,
        $divBottom = null,
        $divLeft = null,
        $divRight = null,

        $cursorStyle = null,

        lastOverElement = null,

        inProcess = false,
        elementPickerCallback = null;

    //Const
    var ELEMENT_FRAME_BORDER = 2;

    //internal events
    var IFRAME_ELEMENT_HOVERED = 'iFrameElementHovered',

        GET_ELEMENT_RECTANGLE_REQUEST = 'getElementRectangleRequest',
        GET_ELEMENT_RECTANGLE_RESPONSE = 'getElementRectangleResponse',

        SET_PREVENT_MOUSEOVER_HANDLER_REQUEST = 'setPreventMouseOverHandlerRequest',
        SET_PREVENT_MOUSEOVER_HANDLER_RESPONSE = 'setPreventMouseOverHandlerResponse',

        IFRAME_ELEMENT_PICKED_REQUEST = 'iFrameElementPickedRequest',
        IFRAME_ELEMENT_PICKED_RESPONSE = 'iFrameElementPickedResponse';

    var isInIFrame = window.top !== window.self;

    //For Testing Purposes
    exports.ELEMENT_HOVERED_EVENT = 'elementHovered';

    //Utils
    function getElementUnderFrame(e) {
        var curElement = e.target;

        if ($elementFrame && $elementFrame[0] && e.target === $elementFrame[0]) {
            $elementFrame.css('visibility', 'hidden');

            curElement = Util.getElementFromPoint(e.clientX, e.clientY, null, true);

            $elementFrame.css('visibility', 'visible');
        }
        return curElement;
    }

    function emulateRealEvents(e, curElement) {
        var eventOptions = {
            clientX: e.clientX,
            clientY: e.clientY,
            which: $.browser.webkit ? Util.WHICH_PARAMETER.NO_BUTTON : 1,
            buttons: Util.BUTTONS_PARAMETER.NO_BUTTON
        };

        var currentElementChanged = true;

        try {
            //NOTE: when lastOverElement was in an iframe that removed, ie raises exception when we try to
            // compare it with current element
            currentElementChanged = curElement !== lastOverElement;
        }
        catch (e) {
            lastOverElement = null;
            currentElementChanged = true;
        }

        if (currentElementChanged && lastOverElement)
            EventSimulator.mouseout(lastOverElement, $.extend({relatedTarget: curElement}, eventOptions));

        var eventName = Util.hasTouchEvents ? 'touchmove' : 'mousemove';

        //NOTE: only in IE a 'mousemove' event is raised before a 'mouseover' one (B236966)
        if (Util.isIE && curElement)
            EventSimulator[eventName](curElement, eventOptions);

        if (currentElementChanged) {
            if (curElement)
                EventSimulator.mouseover(curElement, $.extend({relatedTarget: lastOverElement}, eventOptions));

            lastOverElement = curElement;
        }

        if (!Util.isIE && curElement)
            EventSimulator[eventName](curElement, eventOptions);
    }

    function getOffset(el, point) {
        var elementOffset = Util.getOffsetPosition(el);

        return {
            x: point.x > elementOffset.left ? point.x - elementOffset.left : 0,
            y: point.y > elementOffset.top ? point.y - elementOffset.top : 0
        };
    }

    //Handlers
    function onMouseMove(e, dispatched, prevent) {
        var curElement = getElementUnderFrame(e),
            needEmulate = $elementFrame && $elementFrame[0] && e.target === $elementFrame[0];

        if (!curElement || Util.isShadowUIElement(curElement))
            return;

        var rect = Util.getElementRectangleForMarking(curElement, ELEMENT_FRAME_BORDER, ELEMENT_FRAME_BORDER);

        if (isInIFrame) {
            var documentScroll = Util.getElementScroll($(document));
            rect.top -= documentScroll.top;
            rect.left -= documentScroll.left;

            MessageSandbox.sendServiceMsg({
                cmd: IFRAME_ELEMENT_HOVERED,
                rect: rect
            }, window.top);
        }
        else {
            if (curElement.tagName && curElement.tagName.toLowerCase() === 'iframe' && (!currentIFrameContext || currentIFrameContext === curElement.contentWindow)) {
                if (needEmulate)
                    emulateRealEvents(e, curElement);

                var point = Util.getFixedPositionForIFrame({x: e.pageX, y: e.pageY}, curElement.contentWindow);

                if (Util.isIE && $elementFrame && $elementFrame[0])
                    $elementFrame.css('visibility', 'hidden');

                MessageSandbox.sendServiceMsg({
                    cmd: GET_ELEMENT_RECTANGLE_REQUEST,
                    point: point,
                    needEmulate: needEmulate,
                    clientX: e.clientX,
                    clientY: e.clientY
                }, curElement.contentWindow);
            }
            else if (!currentIFrameContext) {
                if (needEmulate)
                    emulateRealEvents(e, curElement);

                createElementFrame(rect);

                eventEmitter.emit(exports.ELEMENT_HOVERED_EVENT, {
                    element: curElement
                });
            }
        }

        //NOTE: T199100 - we should prevent action on 'element frame' because they can be caught on document
        // and it may lead unexpected behavior
        if (needEmulate)
            prevent();
    }

    function onClick(e, dispatched, prevent) {
        var curElement = getElementUnderFrame(e);

        if (!curElement || Util.isShadowUIElement(curElement))
            return;

        var options = {
            ctrl: e.ctrlKey,
            alt: e.altKey,
            shift: e.shiftKey,
            meta: e.metaKey
        };

        if (!isInIFrame && curElement.tagName && curElement.tagName.toLowerCase() === 'iframe' && (!currentIFrameContext || currentIFrameContext === curElement.contentWindow)) {
            MessageSandbox.sendServiceMsg({
                cmd: SET_PREVENT_MOUSEOVER_HANDLER_REQUEST,
                point: Util.getFixedPositionForIFrame({x: e.pageX, y: e.pageY}, curElement.contentWindow),
                iFrameSelectors: SelectorGenerator.generate($(curElement)),
                options: options
            }, curElement.contentWindow);
        }
        else {
            var actionOffset = getOffset(curElement, Util.getEventAbsoluteCoordinates(e));

            options.offsetX = actionOffset.x;
            options.offsetY = actionOffset.y;

            if (isInIFrame) {
                if (!Util.isIE)
                    EventSandbox.addInternalEventListener(window, ['mouseover'], preventMouseOverAfterElementFrameRemoved);

                MessageSandbox.sendServiceMsg({
                    cmd: IFRAME_ELEMENT_PICKED_RESPONSE,
                    elementSelectors: SelectorGenerator.generate($(curElement)),
                    options: options
                }, window.top);
            }
            else if (!currentIFrameContext) {
                cleanUI();

                EventSandbox.addInternalEventListener(window, ['mouseover'], preventMouseOverAfterElementFrameRemoved);
                elementPickerCallback(SelectorGenerator.generate($(curElement)), null, options);
            }
        }

        prevent();
    }

    function onKeydown(e, dispatched, prevent) {
        if (e.keyCode === Util.KEYS_MAPS.SPECIAL_KEYS.esc) {
            cleanUI();

            if (lastOverElement && lastOverElement.tagName.toLowerCase() === 'iframe')
                ShadowUI.bind($(lastOverElement.contentWindow), 'mouseover', preventMouseOverAfterElementFrameRemoved);
            else
                EventSandbox.addInternalEventListener(window, ['mouseover'], preventMouseOverAfterElementFrameRemoved);

            elementPickerCallback(null);
            prevent();
        }
    }

    function preventEvent(e, dispatched, prevent) {
        if (!Util.isShadowUIElement(e.target))
            prevent();
    }

    function onMouseOut(e, dispatched, prevent) {
        if ($elementFrame && e.target === $elementFrame[0]) {
            EventSimulator.mouseout(lastOverElement, $.extend({relatedTarget: e.relatedTarget}, {
                clientX: e.clientX,
                clientY: e.clientY,
                buttons: Util.BUTTONS_PARAMETER.NO_BUTTON,
                which: $.browser.webkit ? Util.WHICH_PARAMETER.NO_BUTTON : 1
            }));

            //NOTE: T199100 - we should prevent action on 'element frame' because they can be caught on document
            // and it may lead unexpected behavior
            prevent();
        }
        else if (!Util.isShadowUIElement(e.target) && e.target === lastOverElement &&
            $elementFrame && e.relatedTarget === $elementFrame[0])
            prevent();
    }

    function onMouseOver(e, dispanched, prevent) {
        if (!dispanched && (!$elementFrame || e.target !== $elementFrame[0]) && !Util.isShadowUIElement(e.target))
            lastOverElement = e.target;

        var curElement = getElementUnderFrame(e);

        //T198725 - Can't select element for the assertion
        if (!Util.isIE || lastOverElement !== curElement)
            Util.storeElementAttributes(SharedConst.OLD_ATTR_VALUES, curElement);

        //NOTE: T199100 - we should prevent action on 'element frame' because they can be caught on document
        // and it may lead unexpected behavior
        if ($elementFrame && e.target === $elementFrame[0])
            prevent();
    }

    function preventMouseOverAfterElementFrameRemoved(e, dispanched, prevent) {
        if (!dispanched && lastOverElement)
            prevent();

        EventSandbox.removeInternalEventListener(window, ['mouseover'], preventMouseOverAfterElementFrameRemoved);
    }

    //Markup
    function createElementFrame(rect, inParts) {
        if (!inProcess)
            return;

        //NOTE: we're cutting rectangle if it's more than document size to prevent extra scrolling after other element highlighted
        var rectHeight = Util.getDocumentElementHeight() < rect.top + rect.height ? Util.getDocumentElementHeight() - rect.top : rect.height,
            rectWidth = Util.getDocumentElementWidth() < rect.left + rect.width ? Util.getDocumentElementWidth() - rect.left : rect.width,

            $divs = ShadowUI.select('.' + ELEMENT_FRAME_PART_CLASS);

        if (!Util.isIE || !inParts) {
            if ($divs && $divs.length)
                $divs.css('visibility', 'hidden');

            if (!$elementFrame || !$elementFrame[0]) {
                $elementFrame = $('<div></div>').appendTo($recorder);
                ShadowUI.addClass($elementFrame, ELEMENT_FRAME_CLASS);

                $elementFrame.bind('mousedown', function (e) {
                    Util.preventDefault(e);
                });
            }

            $elementFrame.css({
                top: rect.top,
                left: rect.left,
                width: rectWidth,
                height: rectHeight,
                visibility: 'visible'
            });
        }
        else {
            if ($elementFrame && $elementFrame[0])
                $elementFrame.css('visibility', 'hidden');

            //NOTE: we need emulate element frame for iframes in IE because otherwise we can't get element under cursor
            // (out element frame is blocking iframe's element and getElementUnderFrame method returns null)
            if (!$divTop || !$divTop.length) {
                $divTop = $('<div></div>').appendTo($recorder);
                ShadowUI.addClass($divTop, ELEMENT_FRAME_PART_CLASS);
            }

            $divTop.css({
                top: rect.top,
                left: rect.left,
                width: rectWidth,
                height: ELEMENT_FRAME_BORDER
            });

            if (!$divBottom || !$divBottom.length) {
                $divBottom = $('<div></div>').appendTo($recorder);
                ShadowUI.addClass($divBottom, ELEMENT_FRAME_PART_CLASS);
            }

            $divBottom.css({
                top: rect.top + rectHeight - ELEMENT_FRAME_BORDER,
                left: rect.left,
                width: rectWidth,
                height: ELEMENT_FRAME_BORDER
            });

            if (!$divLeft || !$divLeft.length) {
                $divLeft = $('<div></div>').appendTo($recorder);
                ShadowUI.addClass($divLeft, ELEMENT_FRAME_PART_CLASS);
            }

            $divLeft.css({
                top: rect.top + ELEMENT_FRAME_BORDER,
                left: rect.left,
                width: ELEMENT_FRAME_BORDER,
                height: rectHeight - ELEMENT_FRAME_BORDER
            });

            if (!$divRight || !$divRight.length) {
                $divRight = $('<div></div>').appendTo($recorder);
                ShadowUI.addClass($divRight, ELEMENT_FRAME_PART_CLASS);
            }

            $divRight.css({
                top: rect.top + ELEMENT_FRAME_BORDER,
                left: rect.left + rectWidth - ELEMENT_FRAME_BORDER,
                width: ELEMENT_FRAME_BORDER,
                height: rectHeight - ELEMENT_FRAME_BORDER
            });

            $divs.css('visibility', 'visible');
            $divs.bind('mousedown', function (e) {
                Util.preventDefault(e);
            });
        }
    }

    //Behavior
    function cleanUI() {
        if ($elementFrame && $elementFrame[0])
            $elementFrame.remove();
        $elementFrame = null;

        ShadowUI.select('.' + ELEMENT_FRAME_PART_CLASS).remove();

        $divTop = null;
        $divBottom = null;
        $divLeft = null;
        $divRight = null;

        if ($cursorStyle && $cursorStyle[0])
            $cursorStyle.remove();
        $cursorStyle = null;
    }

    function createCursorStyle() {
        var $head = $(document).find('head');

        $cursorStyle = $('<style>*{cursor: crosshair !important;}</style>').appendTo($head[0]);
    }

    function bindHandlers(target) {
        EventSandbox.addInternalEventListener(target, ['mousemove'], onMouseMove);

        EventSandbox.addInternalEventListener(target, ['mouseout'], onMouseOut);

        EventSandbox.addInternalEventListener(target, ['mouseover'], onMouseOver);

        EventSandbox.addInternalEventListener(target, ['click'], onClick);

        EventSandbox.addInternalEventListener(target, ['keydown'], onKeydown);

        EventSandbox.addInternalEventListener(target, ['mousedown', 'mouseup'], preventEvent);

        //NOTE: we create special cursor style for all elements because
        // we want to assign 'crosshair' cursor during element picking
        // (it doesn't work for input and textarea because it's impossible to change their default cursor)
        if (Util.isIE)
            createCursorStyle();
    }

    function unbindHandlers(target) {
        EventSandbox.removeInternalEventListener(target, ['mousemove'], onMouseMove);

        EventSandbox.removeInternalEventListener(target, ['mouseout'], onMouseOut);

        EventSandbox.removeInternalEventListener(target, ['mouseover'], onMouseOver);

        EventSandbox.removeInternalEventListener(target, ['click'], onClick);

        EventSandbox.removeInternalEventListener(target, ['keydown'], onKeydown);

        EventSandbox.removeInternalEventListener(target, ['mousedown', 'mouseup'], preventEvent);
    }

    //API
    exports.on = function () {
        return eventEmitter.on.apply(eventEmitter, arguments);
    };

    exports.off = function () {
        return eventEmitter.off.apply(eventEmitter, arguments);
    };

    var currentIFrameContext = false;

    exports.start = function (callback, iFrameContext) {
        inProcess = true;
        elementPickerCallback = callback;

        currentIFrameContext = iFrameContext;

        bindHandlers(window);
    };

    exports.stop = function () {
        inProcess = false;
        elementPickerCallback = null;

        cleanUI();

        unbindHandlers(window);
    };

    exports.setRecorderUI = function ($recorderUI) {
        $recorder = $recorderUI;
    };

    MessageSandbox.on(MessageSandbox.SERVICE_MSG_RECEIVED, function (e) {
        var msg = e.message,
            curElement = null,
            rect = null,
            fixedPoint = null;

        switch (msg.cmd) {
            //Messages to iframes
            case GET_ELEMENT_RECTANGLE_REQUEST:
                curElement = Util.getElementFromPoint(msg.point.x, msg.point.y);

                if (curElement) {
                    rect = Util.getElementRectangleForMarking(curElement, ELEMENT_FRAME_BORDER, ELEMENT_FRAME_BORDER);

                    var documentScroll = Util.getElementScroll($(document));
                    rect.top -= documentScroll.top;
                    rect.left -= documentScroll.left;

                    if (msg.needEmulate)
                        emulateRealEvents({clientX: msg.clientX, clientY: msg.clientY}, curElement);
                }

                MessageSandbox.sendServiceMsg({
                    cmd: GET_ELEMENT_RECTANGLE_RESPONSE,
                    rect: rect
                }, window.top);
                break;

            case IFRAME_ELEMENT_PICKED_REQUEST:
                curElement = Util.getElementFromPoint(msg.point.x, msg.point.y);

                if (curElement) {
                    var actionOffset = getOffset(curElement, msg.point);

                    msg.options.offsetX = actionOffset.x;
                    msg.options.offsetY = actionOffset.y;

                    elementPickerCallback(SelectorGenerator.generate($(curElement)), msg.iFrameSelectors, msg.options);
                }
                else
                //NOTE: click on cross-domain iframe
                    elementPickerCallback(msg.iFrameSelectors, msg.options);
                break;

            case SET_PREVENT_MOUSEOVER_HANDLER_REQUEST:
                EventSandbox.addInternalEventListener(window, ['mouseover'], preventMouseOverAfterElementFrameRemoved);

                MessageSandbox.sendServiceMsg({
                    cmd: SET_PREVENT_MOUSEOVER_HANDLER_RESPONSE,
                    point: msg.point,
                    iFrameSelectors: msg.iFrameSelectors,
                    options: msg.options
                }, window.top);
                break;

            //Messages to top window
            case GET_ELEMENT_RECTANGLE_RESPONSE:
                rect = e.message.rect;

                if (!rect) {
                    curElement = Util.getIFrameByWindow(e.source);

                    rect = Util.getElementRectangleForMarking(curElement, ELEMENT_FRAME_BORDER, ELEMENT_FRAME_BORDER);
                }
                else {
                    fixedPoint = Util.getFixedPosition({x: rect.left, y: rect.top}, e.source);

                    rect.left = fixedPoint.x;
                    rect.top = fixedPoint.y;
                }

                createElementFrame(rect, true);
                break;

            case SET_PREVENT_MOUSEOVER_HANDLER_RESPONSE:
                cleanUI();

                MessageSandbox.sendServiceMsg({
                    cmd: IFRAME_ELEMENT_PICKED_REQUEST,
                    point: msg.point,
                    iFrameSelectors: msg.iFrameSelectors,
                    options: msg.options
                }, e.source);

                break;

            case IFRAME_ELEMENT_HOVERED:
                rect = e.message.rect;

                fixedPoint = Util.getFixedPosition({x: rect.left, y: rect.top}, e.source);

                rect.left = fixedPoint.x;
                rect.top = fixedPoint.y;

                createElementFrame(rect, true);
                break;

            case IFRAME_ELEMENT_PICKED_RESPONSE:
                var iFrame = Util.getIFrameByWindow(e.source);

                elementPickerCallback(msg.elementSelectors, SelectorGenerator.generate($(iFrame)), msg.options);
                break;
        }
    });
});

TestCafeClient.define('Recorder.EventListener', function (require, exports) {
    var Hammerhead = HammerheadClient.get('Hammerhead'),
        Util = Hammerhead.Util,
        EventSandbox = Hammerhead.EventSandbox,
        EventParser = require('Recorder.EventParser');

    //handlers
    var listeningStarted = false,
        lastListenedEvent = null,
        lastEventPrevented = false,
        preventEvents = false;

    function parseEvent(ev) {
        lastListenedEvent = ev;
        lastEventPrevented = EventParser.parseEvent(ev);
        return lastEventPrevented || preventEvents;
    }

    function genericEventHandler(ev, dispatched) {
        if (dispatched)
            return;

        if (!listeningStarted)
            return;

        //NOTE: if lastListenedEvent contains an target-element which was in an removed iframe,
        // IE raises exception when we try to compare it with current event target-element
        try {
            if (lastListenedEvent === ev) {
                if (lastEventPrevented || preventEvents) {
                    Util.preventDefault(ev);
                    return false;
                }
                else
                    return;
            }
        }
        catch (e) {
            lastListenedEvent = null;
        }

        if (parseEvent(ev)) {
            Util.preventDefault(ev);
            return false;
        }
        else {
            lastEventPrevented = false;
        }

        if (preventEvents) {
            Util.preventDefault(ev);
            return false;
        }
    }

    function cancelHandlersForShadowUITarget(ev, dispatched, preventDefault, cancelHandlers) {
        if (Util.isShadowUIElement(ev.target || ev.srcElement)) {
            cancelHandlers();
        }
    }

    function callGenericEventHandler(ev, dispatched, preventDefault) {
        if (!Util.isShadowUIElement(ev.target || ev.srcElement) &&
            listeningStarted && genericEventHandler.call(this, ev, dispatched) === false)
            preventDefault();
    }

    function bindWindowHandlers() {
        EventSandbox.addInternalEventListener(window, Util.DOM_EVENTS, cancelHandlersForShadowUITarget);
        EventSandbox.addInternalEventListener(window, Util.RECORDING_LISTENED_EVENTS, callGenericEventHandler);
    }

    function bindDocumentHandlers(doc) {
        EventSandbox.addInternalEventListener(doc, Util.DOM_EVENTS, cancelHandlersForShadowUITarget);
    }

    function eventBindingHandler(e) {
        if (e.document) {
            EventSandbox.initElementListening(e.document, Util.RECORDING_LISTENED_EVENTS);
            bindDocumentHandlers(e.document);
        }
    }

    var eventParserCallback = null;

    //API
    Hammerhead.on(Hammerhead.DOM_DOCUMENT_CLEARED, eventBindingHandler);

    exports.start = function (callback, options) {
        bindWindowHandlers();
        bindDocumentHandlers(document);

        listeningStarted = true;

        eventParserCallback = function (action) {
            callback(action);
        };

        EventParser.init(eventParserCallback, options);
    };

    exports.stop = function () {
        listeningStarted = false;
        EventParser.destroy();
    };

    exports.pause = function () {
        listeningStarted = false;
        EventParser.resetParsing();
    };

    exports.resume = function () {
        listeningStarted = true;
    };

    exports.reset = function () {
        EventParser.destroy(true);
        EventParser.init(eventParserCallback);
    };

    exports.createAllDeferred = function () {
        EventParser.createAllDeferred();
    };

    exports.setPreventingMode = function (prevent) {
        preventEvents = prevent;
    };

    exports.checkActionsBeforeAdditionNativeDialogHandler = function(){
      EventParser.checkActionsBeforeAdditionNativeDialogHandler();
    };
});

TestCafeClient.define('Recorder.EventParser', function (require, exports) {
    var Hammerhead = HammerheadClient.get('Hammerhead'),
        $ = Hammerhead.$,
        Util = Hammerhead.Util,
        EventSandbox = Hammerhead.EventSandbox,
        SharedConst = require('Shared.Const'),
        TextSelection = Hammerhead.TextSelection,
        ContentEditableHelper = Hammerhead.ContentEditableHelper,
        SelectorGenerator = require('Recorder.SelectorGenerator'),
        PageState = Hammerhead.PageState,
        KeyEventParser = require('Recorder.KeyEventParser'),
        Automation = require('Automation');

    var DBLCLICK_WAITING_TIMEOUT = 500;

    //Helpers
    function createEventObject(ev, element) {
        var pageCoords = Util.getEventPageCoordinates(ev),
            isIE10PointerEvent = /MSPointer(Down|Move|Up)/.test(ev.type),
            eventShortType = isIE10PointerEvent ? ev.type.replace('MSPointer', '') : '';

        return {
            target: element,
            type: isIE10PointerEvent ? 'pointer' + eventShortType.toLowerCase() : ev.type,
            ctrlKey: ev.ctrlKey,
            altKey: ev.altKey,
            shiftKey: ev.shiftKey,
            metaKey: ev.metaKey,
            pageX: pageCoords.x,
            pageY: pageCoords.y
        };
    }

    var deferredActionQueue = (function () {
        var actionQueue = [];

        function removeAction(index) {
            if (actionQueue[index].timeoutId) {
                window.clearTimeout(actionQueue[index].timeoutId);
                actionQueue[index].timeoutId = null;
            }

            actionQueue[index].isWaitingDblClick = false;
            actionQueue[index].actionCreator = null;
            actionQueue[index].element = null;
            actionQueue[index].actionDescriptor = null;
        }

        function removeAllActions() {
            actionQueue = [];
        }

        function createDeferredAction(type, creator, element, actionDescriptor) {
            return {
                type: type,
                actionCreator: creator,
                element: element,
                elementParent: Util.isContentEditableElement(element) ? ContentEditableHelper.findContentEditableParent(element) : null,
                actionDescriptor: actionDescriptor,
                index: actionQueue.length
            };
        }

        function createAction(index) {
            var action = actionQueue[index];

            if (action.actionCreator)
                action.actionCreator.call();

            if (action.type === 'type')
                keyEventParser.resetTyping();
            else
                mouseEventParser.resetLastElementSelectors();

            removeAction(index);
        }

        function createAllActions() {
            $.each(actionQueue, function (index) {
                createAction(index);
            });
            removeAllActions();
        }

        return {
            init: function () {
                actionQueue = [];
            },
            push: function (type, creator, element, actionDescriptor) {
                var newAction = createDeferredAction(type, creator, element, actionDescriptor),
                    prevAction = actionQueue[newAction.index - 1];

                if (type === 'click') {
                    if (prevAction && prevAction.actionCreator) {
                        if (prevAction.isWaitingDblClick && prevAction.element === element) {
                            removeAction(newAction.index - 1);
                            return;
                        }
                        else
                            createAllActions();
                    }

                    newAction.isWaitingDblClick = true;
                    newAction.timeoutId = window.setTimeout(function () {
                        newAction.isWaitingDblClick = false;
                        newAction.timeoutId = null;

                        if (!Util.isEditableElement(newAction.element))
                            createAllActions();
                    }, DBLCLICK_WAITING_TIMEOUT);
                }
                else if (prevAction && prevAction.actionCreator) {
                    //NOTE: During typing in child of contentEditable elements events 'keydown', 'keypress', 'keyup' occurs
                    //for contentEditable parent element.

                    //We have problem in situation when you made click on one element, then click on another and start typing.
                    //After close addActionDialog for first click contentEditable parent's content will change
                    //and we can not find prevAction element parent.
                    //Therefore, we should store contentEditable parent element in deferred action object.
                    if (prevAction.element === element || (Util.isContentEditableElement(element) && prevAction.elementParent === element))
                        removeAction(newAction.index - 1);
                    else
                        createAllActions();
                }

                actionQueue.push(newAction);
            },
            removeAll: removeAllActions,
            createAll: createAllActions,

            getLastActionType: function () {
                if (!actionQueue.length)
                    return '';

                return actionQueue[actionQueue.length - 1].type;
            },
            getLastActionDescriptor: function () {
                if (!actionQueue.length)
                    return null;

                return actionQueue[actionQueue.length - 1].actionDescriptor;
            },
            isWaitingDblClick: function () {
                return actionQueue.length ?
                    actionQueue[actionQueue.length - 1].isWaitingDblClick :
                    false;
            }
        };
    })();

    //options
    var actionParsedCallback = null,
        executableShortcuts = null,
        recordableShortcutList = null,
        typingStateChangedCallback = null,
        clickEditorStateChangedCallback = null;

    //state
    var preventCurrentEvent = false,
        inParsing = false,
        parsedActionType = '',
        lastParsedActionElement = null,
        lastParsedActionType = null,
        prevPageState = null,
        savedPrevPageState = null,
        typingActionNotified = false,
        typingActionProcessed = false,
        saveSelection = false,
        checkDblclick = false,
        clickedSelectElement = null;

    //Parsers
    var mouseEventParser = (function () {
        var EVENT_CODES = {
                others: 0,
                mousedown: 1,
                pointerdown: 1,
                touchstart: 1,

                mouseup: 2,
                pointerup: 2,
                touchend: 2,

                mousemove: 'm',
                pointermove: 'p',
                click: 3,
                dblclick: 4,
                contextmenu: 5,
                touchmove: 6,

                shortmove: 7,
                mediummove: 8,
                longmove: 9
            },
            EVENT_QUEUE_TYPES = {
                NONE: 0,
                MOUSEMOVE: 1,
                POINTERMOVE: 2,
                MOUSEMOVE_POINTERMOVE: 3,
                POINTERMOVE_MOUSEMOVE: 4
            },
            CHECKED_MOUSE_ACTION_EVENTS = ['click', 'dblclick', 'contextmenu', 'mouseup', 'touchend', 'pointerup'];

        var state = {
            mousePressed: false,
            lastActionType: '',
            lastHoveredElement: null,
            lastHoveredElementSelectors: null,
            lastHoveredElementIFrameSelectors: null,
            startDragElement: null,
            lastPressedElement: null,
            lastMouseDownOffset: null,
            lastMouseDownPosition: null,
            lastMouseDownButton: null,
            clickEditorStateChangedTimeoutId: null
        };

        //helpers
        function createEncodedEventRegExp(regExpString) {
            var event = '',
                res = regExpString;

            for (event in EVENT_CODES) {
                if (EVENT_CODES.hasOwnProperty(event)) {
                    res = res.replace(new RegExp('\\b' + event + '\\b', 'g'), EVENT_CODES[event]);
                }
            }

            return new RegExp(res);
        }

        var beforeNativeDialogClickTemplate = createEncodedEventRegExp('mousedown(,mouseup)?$');

        var events = (function () {
            var eventsState = [],
                lastEvent = '';

            return {
                add: function (e) {
                    var event = e.type;

                    //NOTE: replace combinations of events like 'pointerdown,mousedown' in IE to the 'mousedown'
                    if (event === 'mousedown' || event === 'pointerdown' || event === 'touchstart') {
                        event = 'mousedown';

                        if (lastEvent === 'mousedown')
                            return;
                    } else if (event === 'mouseup' || event === 'pointerup' || event === 'touchend') {
                        event = 'mouseup';

                        if (lastEvent === 'mouseup')
                            return;
                    }

                    eventsState.push(EVENT_CODES[event] || EVENT_CODES.others);
                    lastEvent = event;
                },

                clear: function () {
                    eventsState = [];
                    lastEvent = '';
                },

                getState: function () {
                    return eventsState;
                }
            };
        })();

        function createMouseActionDescriptor(ev, eventType, options, deferred) {
            //NOTE: create descriptor for click, rclick, dblclick, drag and select
            var element = options.element || ev.target,
                isTextEditable = Util.isTextEditableElement(element),
                offset = options.offset,
                selectors = options.selectors,
                startPosition = options.startPosition,
                elementSelectors = null,
                iFrameSelectors = options.iFrameSelectors,
                elementSelectionStart = null,
                elementValueLength = null,
                actionType = eventType ? eventType : ev.type,
                actionElement = null,
                isInverse = null,
                start = null,
                end = null,
                dragPosition = null,

                isDragAction = eventType === 'drag',
                actionDescriptor = null;

            state.lastActionType = actionType;

            if (isDragAction) {
                //NOTE: When drag action recorded via finger (touch screen device)
                //lastHoveredElement isn't correct to creation of action descriptor
                //(startDragElement created from lastHoveredElement)
                actionElement = ev.type === 'touchend' || (Util.isIE && window.navigator.msMaxTouchPoints > 0) ?
                    state.lastPressedElement :
                    (state.startDragElement || element);

                //NOTE: we recognize drag in editable element as a select action
                //(select action is impossible on touch screen devices)
                if (Util.isEditableElement(actionElement) && ev.type !== 'touchend') {
                    actionDescriptor = $.extend(true, {}, Automation.defaultSelectActionDescriptor);

                    if (Util.isContentEditableElement(actionElement) && !TextSelection.hasElementContainsSelection(actionElement))
                        actionElement = ContentEditableHelper.getElementBySelection(TextSelection.getSelectionByElement(actionElement));

                    actionType = 'select';
                    parsedActionType = 'select';
                    isInverse = TextSelection.hasInverseSelection(actionElement);
                    start = TextSelection.getSelectionStart(actionElement);
                    end = TextSelection.getSelectionEnd(actionElement);

                    actionDescriptor.apiArguments.startPos = isInverse ? end : start;
                    actionDescriptor.apiArguments.endPos = isInverse ? start : end;
                }
                else {
                    actionDescriptor = $.extend(true, {}, Automation.defaultDragActionDescriptor);

                    dragPosition = Util.getEventAbsoluteCoordinates(ev);

                    if (Util.isElementInIframe(element)) {
                        var currentIFrame = Util.getIFrameByElement(element);
                        if (currentIFrame) {
                            var iFrameOffset = Util.getOffsetPosition(currentIFrame),
                                iFrameBorders = Util.getBordersWidth($(currentIFrame)),
                                pageCoordinates = Util.getEventPageCoordinates(ev);

                            actionDescriptor.apiArguments.dragOffsetX = pageCoordinates.x - (startPosition.x - iFrameOffset.left - iFrameBorders.left);
                            actionDescriptor.apiArguments.dragOffsetY = pageCoordinates.y - (startPosition.y - iFrameOffset.top - iFrameBorders.top);
                        }
                    }
                    else {
                        actionDescriptor.apiArguments.dragOffsetX = dragPosition.x - startPosition.x;
                        actionDescriptor.apiArguments.dragOffsetY = dragPosition.y - startPosition.y;
                    }

                    dragPosition = Util.getEventAbsoluteCoordinates(ev);

                    //NOTE: we should save start drag position to be able to rollback drag action
                    //also we should save end drag position to be able to emulate 'mouseup' and 'click' actions
                    // with correct coordinates (after confirm drag action)
                    actionDescriptor.startPosition = options.startPosition;
                    actionDescriptor.endPosition = dragPosition;
                }

                elementSelectors = SelectorGenerator.generate($(actionElement));
                iFrameSelectors = SelectorGenerator.generateIFrameSelectorsByElement(actionElement);

                state.startDragElement = null;
            }
            else {
                actionDescriptor = $.extend(true, {}, Automation.defaultMouseActionDescriptor, {
                    type: actionType
                });

                elementSelectors = selectors || SelectorGenerator.generate($(element));
                iFrameSelectors = iFrameSelectors || SelectorGenerator.generateIFrameSelectorsByElement(element);
            }

            if (offset && /click|drag/.test(actionType)) {
                actionDescriptor.apiArguments.options.offsetX = offset.x;
                actionDescriptor.apiArguments.options.offsetY = offset.y;
                actionDescriptor.serviceInfo.useOffsets = isDragAction;
            }

            savedPrevPageState = prevPageState;

            if (/click|drag/.test(actionType)) {
                actionDescriptor.apiArguments.options.ctrl = ev.ctrlKey;
                actionDescriptor.apiArguments.options.alt = ev.altKey;
                actionDescriptor.apiArguments.options.shift = ev.shiftKey;
                actionDescriptor.apiArguments.options.meta = ev.metaKey;
            }

            if ((isTextEditable || Util.isContentEditableElement(element)) && !/drag|select/.test(actionType)) {
                elementSelectionStart = TextSelection.getSelectionStart(element);
                elementValueLength = isTextEditable ? element.value.length : ContentEditableHelper.getContentEditableValue(element).length;
                actionDescriptor.apiArguments.options.caretPos = elementSelectionStart === elementValueLength ? '' : elementSelectionStart;
            }

            return $.extend(true, {}, actionDescriptor, {
                element: actionElement || element,
                selector: elementSelectors[0].selector,
                iFrameSelectors: iFrameSelectors,
                serviceInfo: {
                    selectors: elementSelectors,
                    prevPageState: prevPageState,
                    isDeferred: deferred
                }
            });
        }

        //NOTE: encode events to increase regular expressions executing performance (T230234)
        var actionsTemplates = {
            preclick: createEncodedEventRegExp('mousedown,(shortmove,|mediummove,)?mouseup$'), //BB239376
            click: createEncodedEventRegExp('mousedown,(shortmove,|mediummove,)?mouseup,click$'),
            dblclick: createEncodedEventRegExp('(mousedown,)?(shortmove,)?(mouseup,)?(click,)?dblclick$'),
            rclick: createEncodedEventRegExp('mousedown,(shortmove,)?(mouseup),contextmenu$'),
            drag: createEncodedEventRegExp('mousedown,longmove,mouseup(,click)?$')
        };

        function recognizeAction(ev, force) {
            //NOTE: if drag is ended on other element, click events is not raised
            //otherwise click event is raised
            var joinedState = events.getState().join(',');

            if (state.lastActionType === 'drag' && (joinedState === EVENT_CODES.click + '' || joinedState === EVENT_CODES.mouseup + '')) {
                events.clear();
                return;
            }

            var eventsState = events.getState(),
                processedState = [],
                processedStateString = '',
                curEvent = '',
                queueLength = 0,
                curQueueType = EVENT_QUEUE_TYPES.NONE;

            function stopQueue() {
                if (curQueueType === EVENT_QUEUE_TYPES.MOUSEMOVE_POINTERMOVE || curQueueType === EVENT_QUEUE_TYPES.POINTERMOVE_MOUSEMOVE)
                    queueLength = Math.floor(queueLength / 2);

                if (queueLength > 0 && queueLength <= 2)
                    processedState.push(EVENT_CODES.shortmove);
                else if (queueLength > 2 && queueLength <= 6)
                    processedState.push(EVENT_CODES.mediummove);
                else if (queueLength > 6)
                    processedState.push(EVENT_CODES.longmove);

                queueLength = 0;
                curQueueType = EVENT_QUEUE_TYPES.NONE;
            }

            //NOTE: join long queue of mousemoves to one of the following events: 'shortmove' (0-2 mousemoves), 'mediummove' (3-6), 'longmove' (7+)
            for (var i = 0; i < eventsState.length; i++) {
                curEvent = eventsState[i];
                switch (curEvent) {
                    case EVENT_CODES.mousemove:
                    case EVENT_CODES.touchmove:
                        if (curQueueType === EVENT_QUEUE_TYPES.NONE) {
                            curQueueType = EVENT_QUEUE_TYPES.MOUSEMOVE;
                        } else if (curQueueType === EVENT_QUEUE_TYPES.POINTERMOVE)
                            curQueueType = EVENT_QUEUE_TYPES.POINTERMOVE_MOUSEMOVE;
                        queueLength++;
                        break;
                    case EVENT_CODES.pointermove:
                        if (curQueueType === EVENT_QUEUE_TYPES.NONE) {
                            curQueueType = EVENT_QUEUE_TYPES.POINTERMOVE;
                        } else if (curQueueType === EVENT_QUEUE_TYPES.MOUSEMOVE)
                            curQueueType = EVENT_QUEUE_TYPES.MOUSEMOVE_POINTERMOVE;
                        queueLength++;
                        break;
                    default:
                        if (curQueueType !== EVENT_QUEUE_TYPES.NONE)
                            stopQueue();

                        processedState.push(curEvent);
                        break;
                }
            }

            if (curQueueType !== EVENT_QUEUE_TYPES.NONE)
                stopQueue();

            processedStateString = processedState.join(',');

            $.each(actionsTemplates, function (key, value) {
                if (value.test(processedStateString)) {
                    actionCreators[key](ev, force);
                    return false;
                }
            });
        }

        function resetState() {
            state.mousePressed = false;
            state.lastActionType = '';
            state.lastHoveredElement = null;
            state.lastHoveredElementSelectors = null;
            state.lastHoveredElementIFrameSelectors = null;
            state.startDragElement = null;
            state.lastPressedElement = null;
            state.lastMouseDownOffset = null;
            state.lastMouseDownPosition = null;
            state.lastMouseDownButton = null;
            state.clickEditorStateChangedTimeoutId = null;
        }

        //actions creators
        function createMouseAction(ev, type, deferred) {
            var isClickOnEditableElement = ev.type === 'click' && Util.isEditableElement(ev.target),
                actionDescriptor = createMouseActionDescriptor(ev, type,
                    {
                        element: state.lastPressedElement,
                        offset: state.lastMouseDownOffset,
                        selectors: state.lastHoveredElementSelectors,
                        iFrameSelectors: state.lastHoveredElementIFrameSelectors,
                        startPosition: state.lastMouseDownPosition
                    }, isClickOnEditableElement);

            if (deferred) {
                var deferredActionCreator = function () {
                    if (isClickOnEditableElement && typeof clickEditorStateChangedCallback === 'function') {
                        clickEditorStateChangedCallback.call(this, false);
                    }
                    actionParsedCallback(actionDescriptor);
                };

                if (isClickOnEditableElement && typeof clickEditorStateChangedCallback === 'function') {
                    state.clickEditorStateChangedTimeoutId = window.setTimeout(function () {
                        clickEditorStateChangedCallback.call(this, true, function () {
                            deferredActionQueue.createAll();
                        });
                    }, 0);
                }

                deferredActionQueue.push('click', deferredActionCreator, state.lastPressedElement, actionDescriptor);
            }
            else {
                if (ev.type === 'dblclick' && Util.isEditableElement(ev.target) && typeof clickEditorStateChangedCallback === 'function') {
                    if (state.clickEditorStateChangedTimeoutId) {
                        window.clearTimeout(state.clickEditorStateChangedTimeoutId);
                        state.clickEditorStateChangedTimeoutId = null;
                    }

                    clickEditorStateChangedCallback.call(this, false);
                }

                deferredActionQueue.createAll();
                actionParsedCallback(actionDescriptor);
            }

            events.clear();
        }

        function createDeferredMouseAction(ev, type) {
            createMouseAction(ev, type, true);
        }

        var actionCreators = {
            preclick: function (ev) {
                if (ev.target !== state.lastPressedElement) {
                    ev.type = 'click';
                    actionCreators.click(ev, true);
                }
            },

            click: function (ev, force) {
                parsedActionType = 'click';
                createDeferredMouseAction(ev);

                if (force)
                    deferredActionQueue.createAll();

                events.clear();
            },

            dblclick: function (ev) {
                parsedActionType = 'dblclick';
                createMouseAction(ev);
            },

            rclick: function (ev) {
                parsedActionType = 'rclick';
                createMouseAction(ev, 'rclick');
            },

            drag: function (ev) {
                parsedActionType = 'drag';
                createMouseAction(ev, 'drag');
            }
        };

        //NOTE: in touch devices we should not create drag action when events raised page scaling or scrolling
        var scalingScrollingChecker = (function () {
            var lastInnerHeight = null,
                lastInnerWidth = null,
                lastScrollTop = null,
                lastScrollLeft = null,

                $window = $(window);

            function save() {
                lastInnerHeight = window.innerHeight;
                lastInnerWidth = window.innerWidth;
                lastScrollTop = $window.scrollTop();
                lastScrollLeft = $window.scrollLeft();
            }

            return {
                save: save,
                check: function () {
                    var isZoomingOrScrolling = window.innerHeight !== lastInnerHeight ||
                        window.innerWidth !== lastInnerWidth ||
                        $window.scrollLeft() !== lastScrollLeft ||
                        $window.scrollTop() !== lastScrollTop;
                    save();

                    return isZoomingOrScrolling;
                }
            };
        })();

        //NOTE: we should check events state to identify unfinished clicks after page unload
        var checkEventsState = function () {
            if (createEncodedEventRegExp('^mousedown(,mouseup)?$').test(events.getState().join(',')))
                actionParsedCallback(createMouseActionDescriptor({}, 'click', {element: state.lastPressedElement}));
        };

        //api
        return {
            init: function () {
            },

            destroy: function (skipDeferred) {
                if (!skipDeferred) {
                    deferredActionQueue.createAll();
                    checkEventsState();
                }
                else
                    deferredActionQueue.removeAll();

                events.clear();
                resetState();
            },

            parse: function (ev) {
                if (ev.button === Util.BUTTON.MIDDLE)
                    return;

                var eventElement = ev.target || ev.srcElement,
                    $select = null,
                    selectOffset = null,
                    selectChildIndex = null;

                //NOTE: in mozilla only 'click' event is raised before 'contextmenu' event when mouse right button clicked
                if (Util.isMozilla && ev.type === 'click' && ev.button === Util.BUTTON.RIGHT)
                    return;

                if (/mousemove|touchmove|pointmove|MSPointerMove/.test(ev.type) && !state.mousePressed)
                    return;

                if (/mouseout|pointerout|MSPointerOut/.test(ev.type))
                    return;

                //T173548 - TD_14_2 Safari 8 - Wrong recording click on select and option
                if (Util.isSafari && ev.type === 'click' && Util.isSelectElement(eventElement) && clickedSelectElement && eventElement === clickedSelectElement) {
                    actionParsedCallback(mouseEventParser.createMouseActionDescriptor({}, 'click', {
                        element: clickedSelectElement,
                        selectors: state.lastHoveredElementSelectors,
                        iFrameSelectors: state.lastHoveredElementIFrameSelectors
                    }));
                    actionParsedCallback(mouseEventParser.createMouseActionDescriptor({}, 'click', {element: $(clickedSelectElement).find('option')[clickedSelectElement.selectedIndex]}));
                    clickedSelectElement = null;
                    events.clear();
                    return;
                }

                //NOTE: the 'mousedown' event is not raised when an option tag is clicked
                if ((/pointerdown|MSPointerDown/.test(ev.type) || ((!Util.isIE || Util.browserVersion === 9) && /mousedown|touchstart/.test(ev.type))) ||
                    (Util.isIE && ev.type === 'click' && ev.target.tagName.toLowerCase() === 'option')) {
                    state.lastPressedElement = ev.target || ev.srcElement;
                    state.lastMouseDownButton = ev.button;

                    if (state.lastPressedElement === state.lastHoveredElement) {
                        state.lastHoveredElementSelectors = SelectorGenerator.generate($(state.lastHoveredElement));
                        state.lastHoveredElementIFrameSelectors = SelectorGenerator.generateIFrameSelectorsByElement(state.lastHoveredElement);
                    } else {
                        state.lastHoveredElementSelectors = SelectorGenerator.generate($(state.lastPressedElement));
                        state.lastHoveredElementIFrameSelectors = SelectorGenerator.generateIFrameSelectorsByElement(state.lastPressedElement);
                    }
                    var element = ev.target || ev.srcElement,
                        elementOffset = Util.getOffsetPosition(element);

                    state.lastMouseDownPosition = Util.getEventAbsoluteCoordinates(ev);

                    if ($.browser.webkit && element.tagName.toLowerCase() === 'option') {
                        var select = Util.getSelectParent($(element));

                        if (!select) {
                            elementOffset.left = 0;
                            elementOffset.top = 0;
                        }
                        else {
                            $select = $(select);
                            selectOffset = Util.getOffsetPosition($select[0]);
                            selectChildIndex = Util.getChildVisibleIndex($select, element);

                            elementOffset.left = selectOffset.left;
                            elementOffset.top = selectOffset.top + selectChildIndex * Util.getOptionHeight($select);
                        }
                    }

                    //NOTE: We should save affected element to be able restore selected index
                    if (/pointerdown|MSPointerDown/.test(ev.type) || ((!Util.isIE || Util.browserVersion === 9) && /mousedown|touchstart/.test(ev.type))) {
                        if (Util.isSelectElement(ev.target))
                            PageState.addAffectedElement(prevPageState, ev.target);
                        else if (ev.target.tagName.toLowerCase() === 'option' && Util.getSelectParent($(ev.target)))
                            PageState.addAffectedElement(prevPageState, Util.getSelectParent($(ev.target)));
                    }

                    state.lastMouseDownOffset = {
                        x: state.lastMouseDownPosition.x > elementOffset.left ? state.lastMouseDownPosition.x - elementOffset.left : 0,
                        y: state.lastMouseDownPosition.y > elementOffset.top ? state.lastMouseDownPosition.y - elementOffset.top : 0
                    };

                    if (Util.isElementInIframe(element)) {
                        var currentIFrame = Util.getIFrameByElement(element);
                        if (currentIFrame) {
                            state.lastMouseDownOffset.x -= $(currentIFrame.contentWindow).scrollLeft();
                            state.lastMouseDownOffset.y -= $(currentIFrame.contentWindow).scrollTop();
                        }
                    }

                    //NOTE: for FF we should not record scroll element like drag action (B237789)
                    //than we doesn't set mousePressed state after mousedown on scrollbars
                    if (Util.isMozilla || (Util.isIE && Util.isSelectElement(element) && Util.getSelectElementSize($(element)) > 1)) {
                        var elementDim = Util.getClientDimensions(element);
                        if (Util.hasScroll(element)) {
                            if (element.scrollWidth > element.clientWidth &&
                                state.lastMouseDownOffset.y >= elementDim.height - elementDim.border.bottom - Util.getScrollbarSize())
                                return;

                            if (element.scrollHeight > element.clientHeight &&
                                state.lastMouseDownOffset.x >= elementDim.width - elementDim.border.right - Util.getScrollbarSize())
                                return;
                        }
                        //NOTE: This hack specially for scroll option list of select elements
                        else if (Util.isMozilla && Util.isSelectElement(element) && Util.getSelectVisibleChildren($(element)).length > Util.MAX_OPTION_LIST_LENGTH) {
                            if (state.lastMouseDownOffset.y > elementDim.height + elementDim.border.top + elementDim.border.bottom &&
                                state.lastMouseDownOffset.x >= elementDim.width - elementDim.border.right - Util.getScrollbarSize()) {
                                return;
                            }
                        }
                    }

                    if (ev.button === Util.BUTTON.LEFT || Util.hasTouchEvents)
                        state.mousePressed = true;
                }

                if (/touchstart/.test(ev.type)) {
                    scalingScrollingChecker.save();
                }

                if (/touchend/.test(ev.type) && scalingScrollingChecker.check()) {
                    events.clear();
                    return;
                }

                //NOTE: we don't listen 'mouseup' event when 'mousedown' event was raised before parsing started
                if (/mouseup|touchend|pointerup|MSPointerUp/.test(ev.type) && (ev.button === Util.BUTTON.LEFT || Util.hasTouchEvents)) {
                    if (!state.mousePressed)
                        return;
                    else
                        state.mousePressed = false;
                }

                if (Util.isIE && Util.isSelectElement(eventElement) &&
                    Util.getSelectElementSize($(eventElement)) > 1 && ev.type === 'click') {
                    $select = $(eventElement);
                    selectOffset = Util.getOffsetPosition($select[0]);

                    var $selectChildren = Util.getSelectVisibleChildren($select),
                        eventCoordinates = Util.getEventAbsoluteCoordinates(ev),
                        selectBorders = Util.getBordersWidth($select),
                        optionHeight = Util.getOptionHeight($select);

                    eventCoordinates.x = eventCoordinates.x - selectOffset.left - selectBorders.left + $select.scrollLeft();
                    eventCoordinates.y = eventCoordinates.y - selectOffset.top - selectBorders.top + $select.scrollTop();

                    selectChildIndex = Math.floor(eventCoordinates.y / optionHeight);
                    eventElement = $selectChildren[selectChildIndex];

                    var childOffsetTop = selectChildIndex * optionHeight;

                    state.lastPressedElement = eventElement;
                    state.lastHoveredElementSelectors = SelectorGenerator.generate($(eventElement));
                    state.lastHoveredElementIFrameSelectors = SelectorGenerator.generateIFrameSelectorsByElement(eventElement);
                    state.lastMouseDownOffset.x = eventCoordinates.x > 0 ? eventCoordinates.x : 0;
                    state.lastMouseDownOffset.y = eventCoordinates.y > childOffsetTop ? eventCoordinates.y - childOffsetTop : 0;
                }

                var event = createEventObject(ev, eventElement);

                //NOTE: we clean accumulated 'click' events when 'dblclick' event is raised
                if (event.type === 'dblclick')
                    deferredActionQueue.removeAll();

                if (/pointerover|MSPointerOver/.test(event.type) || ((!Util.isIE || Util.browserVersion === 9) && event.type === 'mouseover')) {
                    state.lastHoveredElement = event.target;

                    //T198725 - Can't select element for the assertion
                    Util.storeElementAttributes(SharedConst.OLD_ATTR_VALUES, state.lastHoveredElement);

                    if (!state.mousePressed) {
                        if (Util.isIE && state.lastHoveredElement.tagName.toLowerCase() === 'iframe' &&
                            state.startDragElement && Util.getIFrameByElement(state.startDragElement) === state.lastHoveredElement)
                            return;
                        state.startDragElement = state.lastHoveredElement;
                    }

                    return;
                }

                //T182240 - Drag actions aren't recorded on http://dev.sencha.com/extjs/5.0.0/examples/organizer/organizer.html in IE
                //This check need for 'mouseover' in IE > 9
                if (event.type !== 'mouseover')
                    events.add(event);

                if ($.inArray(event.type, CHECKED_MOUSE_ACTION_EVENTS) > -1) {
                    var isClickOnLink = event.type === 'click' &&
                        event.target.tagName &&
                        event.target.tagName.toLocaleLowerCase() === 'a' &&
                        event.target.href;

                    recognizeAction(event, isClickOnLink);
                }
            },

            resetLastElementSelectors: function () {
                state.lastHoveredElementSelectors = null;
                state.lastHoveredElementIFrameSelectors = null;
            },

            createMouseActionDescriptor: createMouseActionDescriptor,

            checkActionsBeforeAdditionNativeDialogHandler: function () {
                if (beforeNativeDialogClickTemplate.test(events.getState().join(','))) {
                    actionParsedCallback(createMouseActionDescriptor({}, state.lastMouseDownButton === Util.BUTTON.RIGHT ? 'rclick' : 'click', {element: state.lastPressedElement}));
                    events.clear();
                }
            }
        };
    })();

    var keyEventParser = (function () {
        var parser = null;

        var state = {
            typedSymbols: [],
            inTyping: false,
            isFirstTypedSymbol: false,
            currentElement: null,
            currentElementSelectors: null,
            initialElementValue: null,
            lastHoveredElement: null,
            lastEventType: null
        };

        //helpers
        function hasSymbolsOrShiftOnly(keysCombination) {
            var keys = keysCombination.replace(/^\+/g, 'plus').replace(/\+\+/g, '+plus').split('+');
            $.map(keys, function (key, index) {
                    keys[index] = key.replace('plus', '+');
                }
            );

            for (var i = 0; i < keys.length; i++) {
                if (keys[i].length > 1 && keys[i] !== 'shift' && keys[i] !== 'space')
                    return false;
            }

            return true;
        }

        function resetState() {
            state.typedSymbols = [];
            state.inTyping = false;
            state.currentElement = null;
            state.currentElementSelectors = null;
            state.initialElementValue = null;
            state.lastEventType = null;
        }

        //actions creators
        function createPressActionDescriptor(keys) {
            var descriptor = $.extend(true, {}, Automation.defaultPressActionDescriptor, {
                apiArguments: {
                    keysCommand: keys
                }
            });

            parsedActionType = 'press';
            deferredActionQueue.createAll();
            //NOTE: We should save page state only for using in FF
            // to be able restore selected index
            descriptor.serviceInfo.prevPageState = prevPageState;
            savedPrevPageState = prevPageState;

            actionParsedCallback(descriptor);
        }

        function createTypeActionDescriptor(el) {
            var elementSelectionStart = null,
                elementValueLength = null,
                descriptor = $.extend(true, {}, Automation.defaultTypeActionDescriptor, {
                    element: el
                }),

                secondTypingInSuccession = typingActionNotified && !typingActionProcessed,
                saveActiveCancellingOption = (secondTypingInSuccession || !((lastParsedActionType === 'click' || lastParsedActionType === 'type') && el === lastParsedActionElement));

            if (saveActiveCancellingOption)
                savedPrevPageState = prevPageState;

            var pageState = saveActiveCancellingOption ? prevPageState : savedPrevPageState;

            if (state.inTyping && state.isFirstTypeSymbol)
                PageState.addAffectedElement(pageState, el);

            descriptor.apiArguments.text = state.typedSymbols.join('');
            descriptor.serviceInfo.prevPageState = pageState;

            var lastActionDescriptor = deferredActionQueue.getLastActionDescriptor();

            if (lastActionDescriptor) {
                var lastOptions = lastActionDescriptor.apiArguments.options;

                if (lastOptions)
                    descriptor.apiArguments.options = lastOptions;

                descriptor.element = lastActionDescriptor.element;
            }
            else {
                elementSelectionStart = TextSelection.getSelectionStart(el);
                elementValueLength = Util.isTextEditableElement(el) ? el.value.length : ContentEditableHelper.getContentEditableValue(el).length;
                descriptor.apiArguments.options.caretPos = elementSelectionStart === elementValueLength ? '' : elementSelectionStart;
            }

            descriptor.serviceInfo.selectors = lastActionDescriptor ?
                lastActionDescriptor.serviceInfo.selectors :
                SelectorGenerator.generate($(state.lastHoveredElement));

            descriptor.iFrameSelectors = lastActionDescriptor ?
                 lastActionDescriptor.iFrameSelectors :
                 SelectorGenerator.generateIFrameSelectorsByElement(state.lastHoveredElement);

            descriptor.selector = descriptor.serviceInfo.selectors[0].selector;

            return descriptor;
        }

        function createTypeAction(el, deferred) {
            parsedActionType = 'type';

            var typeActionDescriptor = createTypeActionDescriptor(el),
                completeTypeActionIconCreated = false,
                typeActionCreated = false;

            if (deferred) {
                var deferredActionCreator = function () {
                    typeActionCreated = true;
                    state.initialElementValue = null;

                    if (typeof typingStateChangedCallback === 'function') {
                        if (completeTypeActionIconCreated)
                            typingStateChangedCallback.call(this, false);
                        else
                            typingStateChangedCallback.call(this, true);
                    }

                    actionParsedCallback(typeActionDescriptor);
                    typingActionNotified = true;
                };

                if (typeof typingStateChangedCallback === 'function') {
                    window.setTimeout(function () { //B235930
                        if (!typeActionCreated) {
                            completeTypeActionIconCreated = true;

                            typingStateChangedCallback.call(this, true, function () {
                                deferredActionQueue.createAll();
                            });
                        }
                        else
                            typingStateChangedCallback.call(this, false);
                    }, 0);
                }

                deferredActionQueue.push('type', deferredActionCreator, el, typeActionDescriptor);
            }
            else
                deferredActionQueue.createAll();
        }

        //events handlers
        function symbolPressed(charCode, target) {
            if (state.createOnKeyPress)
                return;

            if (Util.isEditableElement(target)) {
                state.isFirstTypeSymbol = !state.inTyping;
                state.inTyping = true;
                state.typedSymbols.push(String.fromCharCode(charCode));
                state.currentElement = target;
                createTypeAction(target, true);
            }
            else {
                state.inTyping = false;
                state.isFirstTypeSymbol = false;
            }
        }

        function keysPressedCallback(keysCombination, force) {
            if (!force && state.inTyping && hasSymbolsOrShiftOnly(keysCombination)) {
                //T243116 - TD15.1 - Enter pressing isn't recorded on https://jsfiddle.net/
                if (!(state.currentElement.tagName.toLowerCase() === 'textarea' && keysCombination === '\n' && state.typedSymbols[state.typedSymbols.length] !== '\n'))
                    return;
            }

            if (state.typedSymbols.length)
                createTypeAction(state.currentElement);

            //NOTE: we don't record separated key presses of 'Ctrl' and 'Shift'
            // because they are useless and we use this keys for control stepsPanel
            if (keysCombination !== 'ctrl' && keysCombination !== 'shift')
                createPressActionDescriptor(keysCombination.replace(/\n/g, 'enter')); //T230273
        }

        //api
        return {
            init: function () {
                var options = {
                    symbolPressed: symbolPressed,
                    keysPressed: keysPressedCallback,
                    shortcutHandlers: {}
                };

                var createExecutableShortcutHandler = function (shortcut) {
                    return {
                        start: function () {
                            preventCurrentEvent = true;

                            if (typeof executableShortcuts[shortcut].start === 'function')
                                executableShortcuts[shortcut].start();
                            else if (typeof executableShortcuts[shortcut] === 'function')
                                executableShortcuts[shortcut]();
                        },
                        end: function () {
                            preventCurrentEvent = true;

                            if (typeof executableShortcuts[shortcut].end === 'function')
                                executableShortcuts[shortcut].end();
                        },
                        multiple: false
                    };
                };

                for (var executableShortcut in executableShortcuts) {
                    if (executableShortcuts.hasOwnProperty(executableShortcut))
                        options.shortcutHandlers[executableShortcut.toLowerCase()] = createExecutableShortcutHandler(executableShortcut);
                }

                var accumulatedKeys = [];

                var createRecordableShortcutHandler = function () {
                    return {
                        start: function (keys) {
                            preventCurrentEvent = false;
                            accumulatedKeys.push(keys);
                        },
                        end: function () {
                            //T182340 - Press 'Tab' and 'Shift+Tab' recording problem
                            if (accumulatedKeys && accumulatedKeys.length)
                                keysPressedCallback(accumulatedKeys.join(' '), true);
                            accumulatedKeys = [];
                            preventCurrentEvent = false;
                        }
                    };
                };

                if (recordableShortcutList)
                    for (var i = 0; i < recordableShortcutList.length; i++)
                        options.shortcutHandlers[recordableShortcutList[i].toLowerCase()] = createRecordableShortcutHandler();

                parser = new KeyEventParser();
                parser.init(options);
            },

            destroy: function (skipDeferred) {
                if (!parser)
                    return;

                if (!skipDeferred) {
                    if (state.typedSymbols.length)
                        createTypeAction(state.currentElement);

                    //NOTE: this check for case when not symbol key was pressed and page was unloaded after that.
                    // Keydown and keypress (keypress in optional) are raised before unloding, but no keyup.
                    if (!parser.inTyping && !parser.suspend && parser.currentKeysCombination)
                        keysPressedCallback(parser.currentKeysCombination, true);
                }

                parser.clear();
                resetState();
            },

            clearState: function () {
                parser.clearState();
            },

            parse: function (ev) {
                var curElement = ev.target || ev.srcElement;

                if (!state.inTyping && ev.type === 'keydown') {
                    state.lastHoveredElement = curElement;

                    //T198725 - Can't select element for the assertion
                    Util.storeElementAttributes(SharedConst.OLD_ATTR_VALUES, state.lastHoveredElement);

                    //NOTE: We should save affected element only for FF
                    // to be able restore selected index
                    if (Util.isMozilla && Util.isSelectElement(curElement))
                        PageState.addAffectedElement(prevPageState, curElement);
                }
                //NOTE: There is different behavior when recording select an 'option' tag in 'select' element.
                // In webkit 'option' element is not visual and click on it raises 'change event on the 'select' element only.
                // In firefox, opera and ie it raises 'click' event on 'option' element.
                // Therefore in webkit and IE we should catch the 'change' event after click on a 'select' element.
                else if (Util.isSelectElement(curElement) && ev.type === 'change') {
                    if ($.browser.webkit && Util.getSelectElementSize($(curElement)) === 1) {
                        deferredActionQueue.createAll();

                        //T173548 - TD_14_2 Safari 8 - Wrong recording click on select and option
                        if (Util.isSafari)
                            clickedSelectElement = curElement;
                        else {
                            //T122981: TD14_1_2 - Actions are not record and playback with select that has optgroup tags
                            actionParsedCallback(mouseEventParser.createMouseActionDescriptor({}, 'click', {element: $(curElement).find('option')[curElement.selectedIndex]}));
                        }
                    }

                }

                EventSandbox.watchElementEditing(curElement);
                state.lastEventType = ev.type;
                parser.pushEvent(ev);
            },

            resetTyping: function () {
                state.inTyping = false;
                state.typedSymbols = [];
            },

            mouseActionParsed: function () {
                parser.mouseActionParsed();
            },

            createTypeAndDeferredActions: function () {
                if (state.typedSymbols.length)
                    createTypeAction(state.currentElement);

                deferredActionQueue.createAll();
            },

            checkActionsBeforeAdditionNativeDialogHandler: function () {
                if (state.lastEventType === 'keydown') {
                    if (parser.symbolPressed)
                        state.createOnKeyPress = true;

                    parser.endKeyPressing();
                }
            }
        };
    })();

    //API
    exports.init = function (callback, options) {
        actionParsedCallback = callback;

        if (options) {
            executableShortcuts = options.executableShortcuts || {};
            recordableShortcutList = options.recordableShortcutList || [];
            typingStateChangedCallback = options.typingStateChangedCallback || null;
            clickEditorStateChangedCallback = options.clickEditorStateChangedCallback || null;
        }

        inParsing = true;

        $(document).ready(function () {
            prevPageState = PageState.saveState();
            savedPrevPageState = prevPageState;
        });

        mouseEventParser.init();
        keyEventParser.init({});
        deferredActionQueue.init();
    };

    exports.destroy = function (skipDeferred) {
        inParsing = false;
        keyEventParser.destroy(skipDeferred);
        mouseEventParser.destroy(skipDeferred);
        actionParsedCallback = null;
        parsedActionType = '';
        prevPageState = null;
        savedPrevPageState = null;
        lastParsedActionElement = null;
        lastParsedActionType = null;
        typingActionNotified = false;
        typingActionProcessed = false;
    };

    exports.resetParsing = function () {
        if (inParsing) {
            inParsing = false;
            keyEventParser.clearState();
        }
    };

    exports.parseEvent = function (ev) {
        inParsing = true;

        var isEditable = Util.isEditableElement(ev.target || ev.srcElement, true);

        //NOTE: we should save current selection before the new action will be raised
        if (saveSelection ||
            (checkDblclick && !deferredActionQueue.isWaitingDblClick() && !(ev.type === 'dblclick' && isEditable))) {
            prevPageState = PageState.saveState();

            saveSelection = false;
            checkDblclick = false;
        }

        if (/(^mouse\w+$)|(^touch\w+$)|(^pointer\w+$)|(^MSPointer\w+$)|^(dbl)?click$|^contextmenu$/.test(ev.type))
            mouseEventParser.parse(ev);

        if (/^key\w+$|^change$/.test(ev.type))
            keyEventParser.parse(ev);

        var curParsedAction = parsedActionType;

        if (parsedActionType) {
            lastParsedActionElement = ev.target || ev.srcElement;
            lastParsedActionType = parsedActionType;

            if (typingActionNotified && !typingActionProcessed)
                typingActionProcessed = true;
            else if (typingActionNotified && typingActionProcessed) {
                typingActionProcessed = false;
                typingActionNotified = false;
            }

            if (deferredActionQueue.getLastActionType() !== 'click')
                saveSelection = true;
            else
                checkDblclick = true;

            //B254740
            if (/click|drag|select/.test(parsedActionType))
                keyEventParser.mouseActionParsed();

            parsedActionType = '';
        }

        //NOTE: In webkit click on 'option' element raises 'change event on the 'select' element (without 'click' for option)
        // and we recognize it like click on option but we should prevent bubbling click for select element

        var prevent = preventCurrentEvent ||
            ($.browser.webkit && lastParsedActionElement && Util.isSelectElement(lastParsedActionElement) && ev.type === 'click' && curParsedAction === '' &&
            lastParsedActionType === 'click' && lastParsedActionElement === (ev.target || ev.srcElement));

        preventCurrentEvent = false;

        return prevent;
    };

    exports.createAllDeferred = function () {
        keyEventParser.createTypeAndDeferredActions();
    };

    exports.checkActionsBeforeAdditionNativeDialogHandler = function () {
        if (inParsing) {
            deferredActionQueue.createAll();

            mouseEventParser.checkActionsBeforeAdditionNativeDialogHandler();
            keyEventParser.checkActionsBeforeAdditionNativeDialogHandler();
        }
    };
});
TestCafeClient.define('Recorder.KeyEventParser', function () {
    var Hammerhead = HammerheadClient.get('Hammerhead'),
        $ = Hammerhead.$,
        Util = Hammerhead.Util;

    //consts
    var TAB_KEY_CODE = Util.KEYS_MAPS.SPECIAL_KEYS['tab'];

    //utils
    function inModifying(state) {
        if (!(state.ctrl || state.alt || state.meta) && state.shift)
            return false;

        return state.ctrl || state.alt || state.shift || state.meta;
    }

    function keyToString(keyCode) {
        var activeElement = Util.getActiveElement();

        if (keyCode === Util.KEYS_MAPS.SPECIAL_KEYS.enter && !Util.isShadowUIElement(activeElement) &&
            activeElement.tagName.toLowerCase() === 'textarea') {
            return String.fromCharCode(10); //newline character
        }

        if (keyCode === Util.KEYS_MAPS.SPECIAL_KEYS.space)
            return Util.KEYS_MAPS.REVERSED_SPECIAL_KEYS[keyCode];

        return Util.isCharByKeyCode(keyCode) ?
            String.fromCharCode(Util.KEYS_MAPS.SYMBOLS_KEYS_CHAR_CODES[keyCode] || keyCode).toLowerCase() :
            (Util.KEYS_MAPS.REVERSED_SPECIAL_KEYS[keyCode] || Util.KEYS_MAPS.REVERSED_MODIFIERS[keyCode]) || '';
    }

    function addKey(keyCode, keysCombination) {
        var res = keysCombination;

        if (res)
            res += '+';

        return res + keyToString(keyCode);
    }

    function escapeSpecialSymbols(str) {
        return str.replace(/\(|\)|\[|\]|\\|\.|\^|\$|\||\?|\+|\*/, function (symbol) {
            return '\\' + symbol;
        });
    }

    function removeKey(keyCode, keysCombination) {
        if (!keyCode)
            return keysCombination;

        var keyString = escapeSpecialSymbols(keyToString(keyCode));

        return keysCombination.replace(new RegExp('\\+?' + keyString + '($|\\+)'), '');
    }

    function containsKey(keyCode, keysCombination) {
        var keyString = escapeSpecialSymbols(keyToString(keyCode));

        return (new RegExp('(^|\\+)' + keyString + '($|\\+)')).test(keysCombination);
    }

    //KeyEventParser
    var KeyEventParser = this.exports = function () {
        //callbacks
        this.symbolPressedCallback = null;
        this.keysPressedCallback = null;
        this.shortcutHandlers = {};

        //state
        this.modifiersState = { ctrl: false, alt: false, shift: false, meta: false };
        this.currentKeysCombination = '';
        this.savedKeysCombinations = [];
        this.pressedKeys = [];
        this.symbolPressed = false;
        this.currentStartShortcutHandler = null;
        this.suspend = false;

        var parser = this;
        //NOTE: to prevent keydown without keyup collision (for example: if you press F12 after keydown event window
        // loses focus and key up event is not raised)
        $(window).bind('blur', function (e) {
            if ((e.target || e.srcElement) === window)
                parser.clearState();
        });
    };


    //event handlers
    var lastKeyCode = null,
        repeatedSymbolSaved = false;

    KeyEventParser.prototype._keyDownHandler = function (ev) {
        var keyCode = ev.keyCode;

        //multiple key press handling
        this.currentEndShortcutHandler = null;

        if (this.currentStartShortcutHandler) {
            if (containsKey(keyCode, this.currentKeysCombination)) {
                if (this.currentStartShortcutHandler.multiple) {
                    this.currentKeysCombination = removeKey(keyCode, this.currentKeysCombination);
                    lastKeyCode = null;
                }
                else
                    return;
            }

            else {
                var joinedCombination = addKey(keyCode, this.currentKeysCombination),
                    newCombinationWithModifier = addKey(keyCode, removeKey(lastKeyCode, this.currentKeysCombination)),

                    joinedShortcut = this.shortcutHandlers[joinedCombination],
                    newShortcut = this.shortcutHandlers[newCombinationWithModifier];

                if ((newShortcut && newShortcut.start) &&
                    (joinedCombination === newCombinationWithModifier || !(joinedShortcut && joinedShortcut))) {
                    this.currentKeysCombination = removeKey(lastKeyCode, this.currentKeysCombination);
                }
                else if (this.shortcutHandlers[addKey(keyCode, '')] && this.shortcutHandlers[addKey(keyCode, '')].start)
                    this.currentKeysCombination = '';
            }
        }

        this.currentStartShortcutHandler = null;

        if (Util.KEYS_MAPS.REVERSED_MODIFIERS[keyCode]) {
            if (this.modifiersState[Util.KEYS_MAPS.REVERSED_MODIFIERS[keyCode]])
                return;

            this.modifiersState[Util.KEYS_MAPS.REVERSED_MODIFIERS[keyCode]] = true;
        }

        this.symbolPressed = Util.isCharByKeyCode(keyCode);

        if (!this.symbolPressed && this.inTyping) {
            this.inTyping = false;
            this.currentKeysCombination = '';
        }

        if ((!this.symbolPressed || inModifying(this.modifiersState)) && lastKeyCode === keyCode) {
            if (!this.savedKeysCombinations.length)
                this.savedKeysCombinations.push(this.currentKeysCombination);

            this.savedKeysCombinations.push(this.currentKeysCombination);
            repeatedSymbolSaved = true;
        }
        else {
            this.currentKeysCombination = addKey(keyCode, this.currentKeysCombination);
            repeatedSymbolSaved = false;
        }

        lastKeyCode = keyCode;

        var shortcutHandler = Util.getShortcutHandlerByKeyCombination(this.shortcutHandlers, this.currentKeysCombination);

        if (shortcutHandler) {
            this.currentStartShortcutHandler = shortcutHandler;

            if (this.inTyping)
                this.currentKeysCombination = Util.getShortcutsByKeyCombination(this.shortcutHandlers, this.currentKeysCombination)[0];

            if (shortcutHandler.start)
                shortcutHandler.start(this.currentKeysCombination);

            this.inTyping = false;
        }
        //NOTE: when focus is in the last focusable element on the page and tab key was pressed, keyup event
        //is not raised on any dom element because of default browser behavior (except mozilla and opera).
        // It means we should create tab press action on keydown event
        else if (!(Util.isMozilla || $.browser.opera) &&
            keyCode === TAB_KEY_CODE &&
            this.currentKeysCombination === 'tab' &&
            Util.getNextFocusableElement(Util.getActiveElement()).tagName.toLowerCase() === 'body') {

            if (this.keysPressedCallback)
                this.keysPressedCallback(this.currentKeysCombination);

            this.currentKeysCombination = '';
            this.pressedKeys = [];

            return;
        }

        this.pressedKeys.push(keyCode);
    };

    KeyEventParser.prototype._keyPressHandler = function (ev) {
        var charCode = ev.charCode || ev.keyCode;

        if (!this.symbolPressed || inModifying(this.modifiersState) || this.currentStartShortcutHandler)
            return;

        this.inTyping = true;

        if (this.symbolPressedCallback)
            this.symbolPressedCallback(charCode, ev.target || ev.srcElement);
    };

    KeyEventParser.prototype._keyUpHandler = function (ev) {
        var keyCode = ev.keyCode;

        if (Util.KEYS_MAPS.REVERSED_MODIFIERS[keyCode])
            this.modifiersState[Util.KEYS_MAPS.REVERSED_MODIFIERS[keyCode]] = false;

        var shortcutHandler = Util.getShortcutHandlerByKeyCombination(this.shortcutHandlers, this.currentKeysCombination);

        if (!this.suspend && shortcutHandler && shortcutHandler.end) {
            if (this.currentEndShortcutHandler !== shortcutHandler) {
                this.currentEndShortcutHandler = shortcutHandler;
                shortcutHandler.end();
            }
        }

        if (this.currentStartShortcutHandler && this.currentStartShortcutHandler.start)
            this.currentKeysCombination = removeKey(keyCode, this.currentKeysCombination);

        this.pressedKeys = $.map(this.pressedKeys, function (item) {
            return item === keyCode ? null : item;
        });

        if (!this.currentKeysCombination.length) {
            this.savedKeysCombinations = [];
            lastKeyCode = null;
            this.suspend = false;

            return;
        }

        if (!this.pressedKeys.length) {
            if (this.suspend)
                this.suspend = false;
            else if (this.keysPressedCallback) {
                if (!this.savedKeysCombinations.length)
                    this.keysPressedCallback(this.currentKeysCombination);
                else
                    this.keysPressedCallback(this.savedKeysCombinations.join(' '));
            }

            this.currentKeysCombination = '';
            this.savedKeysCombinations = [];
            lastKeyCode = null;
        }
        else {
            if (!Util.isCharByKeyCode(keyCode) || inModifying(this.modifiersState)) {
                if (lastKeyCode === keyCode)
                    lastKeyCode = null;

                if (this.lastKeysCombination !== this.currentKeysCombination && !repeatedSymbolSaved && !this.currentStartShortcutHandler)
                    this.savedKeysCombinations.push(this.currentKeysCombination);

                repeatedSymbolSaved = false;
                this.currentKeysCombination = removeKey(keyCode, this.currentKeysCombination);
                this.lastKeysCombination = this.currentKeysCombination;
            }
        }
    };

    //API
    KeyEventParser.prototype.init = function (options) {
        /*
         init: function(options)

         options: {
         symbolPressed(charCode, target), // raised when some writible symbol was pressed
         keysPressed(keysCombination), // raised when some key (or combination) was pressed (such as 'ctrl+a', 'left' etc.)
         shortcutHandlers {
         'shortcut': shortcutHandler // raised when shortcut is pressed
         or
         'shortcut': {
         start: startShortcutHandler, //raised when shortcut is pressed [optional]
         end: endShortcutHandler, //raised when shortcut keys is up [optional]
         multiple: true|false // raise handler again while keys are held (default: true) [optional]
         }
         }
         }
         */
        var parser = this;

        if (!options)
            return;

        if (options.symbolPressed)
            parser.symbolPressedCallback = options.symbolPressed;

        if (options.keysPressed)
            parser.keysPressedCallback = options.keysPressed;

        if (options.shortcutHandlers) {
            $.each(options.shortcutHandlers, function (keys, handlers) {
                if (handlers instanceof Function)
                    parser.shortcutHandlers[keys] = { start: handlers, multiple: true };
                else {
                    parser.shortcutHandlers[keys] = {
                        start: handlers.start,
                        end: handlers.end,
                        multiple: typeof handlers.multiple === 'undefined' ? true : handlers.multiple
                    };
                }
            });
        }
    };

    KeyEventParser.prototype.clearState = function () {
        this.pressedKeys = [];
        this.currentKeysCombination = '';
        this.modifiersState = { ctrl: false, alt: false, shift: false, meta: false };
        this.savedKeysCombinations = [];
        this.symbolPressed = false;
        this.currentStartShortcutHandler = null;
        lastKeyCode = null;
        repeatedSymbolSaved = false;
    };

    KeyEventParser.prototype.clear = function () {
        var parser = this;

        parser.clearState();
        parser.symbolPressedCallback = null;
        parser.keysPressedCallback = null;
        parser.shortcutHandlers = {};
    };

    KeyEventParser.prototype.pushEvent = function (ev) {
        if (ev.type === 'keydown' && !this.suspend)
            this._keyDownHandler(ev);

        if (ev.type === 'keypress' && !this.suspend)
            this._keyPressHandler(ev);

        if (ev.type === 'keyup')
            this._keyUpHandler(ev);
    };

    KeyEventParser.prototype.mouseActionParsed = function () {
        //NOTE: (B254740) if some mouse action was parsed when some key is pressed we are waiting for the moment when
        // there is not any pressed key
        if (lastKeyCode)
            this.suspend = true;
    };

    KeyEventParser.prototype.endKeyPressing = function(){
        var keyEventParser = this;

        this.pressedKeys.forEach(function(key){
            keyEventParser._keyUpHandler({
                keyCode: key
            });
        });
    };
});
TestCafeClient.define('Recorder.PlaybackRunner', function (require) {
    var Hammerhead = HammerheadClient.get('Hammerhead'),
        Util = Hammerhead.Util,
        Transport = require('Base.Transport'),
        ServiceCommands = require('Shared.ServiceCommands'),

        TestRunnerBase = require('TestRunner.TestRunnerBase');

    var PlaybackRunner = this.exports = function () {
        TestRunnerBase.apply(this);
    };

    Util.inherit(PlaybackRunner, TestRunnerBase);

    PlaybackRunner.prototype.TEST_FAILED_EVENT = 'testFailed';

    PlaybackRunner.prototype._onTestComplete = function (e) {
        PlaybackRunner.base._destroy.call(this);

        PlaybackRunner.base._onTestComplete.call(this, e);
    };

    PlaybackRunner.prototype._onError = function (err) {
        if (!err.pageError)
            this.testIterator.stop();

        TestRunnerBase.prototype._onError.call(this, err);
    };

    PlaybackRunner.prototype.skipStep = function (stepNames, steps, nextStep) {
        if (typeof nextStep !== 'undefined')
            this.testIterator.state.step = nextStep;

        this.testIterator.state.stepNames = stepNames;
        this.testIterator.state.testSteps = steps;

        this.testIterator.runNext();
    };

    PlaybackRunner.prototype.resumePlayback = function (stepNames, steps) {
        this.testIterator.state.stepNames = stepNames;
        this.testIterator.state.testSteps = steps;

        this.testIterator.runLast();
    };

    PlaybackRunner.prototype._onAssertionFailed = function (e) {
        this.testIterator.stop();
        this.eventEmitter.emit(this.TEST_FAILED_EVENT, e);
    };

    PlaybackRunner.prototype._onNextStepStarted = function (e) {
        var nextStepMsg = {
            cmd: ServiceCommands.SET_NEXT_STEP_PLAYBACK,
            nextStep: e.nextStep
        };

        this.eventEmitter.emit(this.NEXT_STEP_STARTED_EVENT, e);

        Transport.asyncServiceMsg(nextStepMsg, e.stop ? null : e.callback);
    };

    PlaybackRunner.prototype._onActionTargetWaitingStarted = function (e) {
        TestRunnerBase.prototype._onActionTargetWaitingStarted.apply(this, [e]);

        Transport.asyncServiceMsg({
            cmd: ServiceCommands.SET_ACTION_TARGET_WAITING_PLAYBACK,
            value: true
        });
    };

    PlaybackRunner.prototype._onActionRun = function () {
        TestRunnerBase.prototype._onActionRun.apply(this, []);

        Transport.asyncServiceMsg({
            cmd: ServiceCommands.SET_ACTION_TARGET_WAITING_PLAYBACK,
            value: false
        });
    };

    PlaybackRunner.prototype._onDialogsInfoChanged = function (info) {
        Transport.asyncServiceMsg({
            cmd: ServiceCommands.NATIVE_DIALOGS_INFO_SET,
            info: info,
            timeStamp: Date.now()
        });
    };
});

TestCafeClient.define('Recorder.PropertyListGenerator', function (require, exports) {
    var Hammerhead = HammerheadClient.get('Hammerhead'),
        $ = Hammerhead.$,
        Util = Hammerhead.Util,
        MessageSandbox = Hammerhead.MessageSandbox,
        IFrameMessages = require('Base.CrossDomainMessages'),
        JavascriptExecutor = require('Base.JavascriptExecutor');

    function getGeneralPropertyConstructorsForJQueryObject() {
        return [
            {
                name: 'exists',
                isSuitable: function () {
                    return true;
                },
                getValue: function (obj) {
                    return obj.length > 0;
                },
                generateGetter: function (selector) {
                    return selector + '.length > 0';
                },
                isDefault: true
            },
            {
                name: 'text',
                isSuitable: function (obj) {
                    return !!obj.length;
                },
                getValue: function (obj) {
                    return obj.text();
                },
                generateGetter: function (selector) {
                    return selector + '.text()';
                }
            },
            {
                name: 'value',
                isSuitable: function (obj) {
                    return obj.length === 1 && hasValueProperty(obj[0]);
                },
                getValue: function (obj) {
                    return obj.val();
                },
                generateGetter: function (selector) {
                    return selector + '.val()';
                }
            },
            {
                name: 'selectedIndex',
                isSuitable: function (obj) {
                    return obj.length === 1 && hasSelectedIndexProperty(obj[0]);
                },
                getValue: function (obj) {
                    return obj[0].selectedIndex;
                },
                generateGetter: function (selector) {
                    return selector + '[0].selectedIndex';
                }
            },
            {
                name: 'checked',
                isSuitable: function (obj) {
                    return obj.length === 1 && hasCheckedProperty(obj[0]);
                },
                getValue: function (obj) {
                    return obj[0].checked;
                },
                generateGetter: function (selector) {
                    return selector + '[0].checked';
                }
            },
            {
                name: 'visible',
                isSuitable: function () {
                    return true;
                },
                getValue: function (obj) {
                    return obj.is(':visible');
                },
                generateGetter: function (selector) {
                    return selector + '.is(":visible")';
                }
            },
            {
                name: 'class',
                isSuitable: function (obj) {
                    return obj.length === 1;
                },
                getValue: function (obj) {
                    return obj.attr('class');
                },
                generateGetter: function (selector) {
                    return selector + '.attr("class")';
                }
            },
            {
                name: 'matching element count',
                isSuitable: function () {
                    return true;
                },
                getValue: function (obj) {
                    return obj.length;
                },
                generateGetter: function (selector) {
                    return selector + '.length';
                }
            },
            {
                name: 'child element count',
                isSuitable: function (obj) {
                    return !!obj.length;
                },
                getValue: function (obj) {
                    return obj.children().length;
                },
                generateGetter: function (selector) {
                    return selector + '.children().length';
                }
            },
            {
                name: 'width',
                isSuitable: function (obj) {
                    return obj.length === 1;
                },
                getValue: function (obj) {
                    return obj.outerWidth();
                },
                generateGetter: function (selector) {
                    return selector + '.outerWidth()';
                }
            },
            {
                name: 'height',
                isSuitable: function (obj) {
                    return obj.length === 1;
                },
                getValue: function (obj) {
                    return obj.outerHeight();
                },
                generateGetter: function (selector) {
                    return selector + '.outerHeight()';
                }
            },
            {
                name: 'left',
                isSuitable: function (obj) {
                    return obj.length === 1;
                },
                getValue: function (obj) {
                    return obj.offset().left;
                },
                generateGetter: function (selector) {
                    return selector + '.offset().left;';
                }
            },
            {
                name: 'top',
                isSuitable: function (obj) {
                    return obj.length === 1;
                },
                getValue: function (obj) {
                    return obj.offset().top;
                },
                generateGetter: function (selector) {
                    return selector + '.offset().top';
                }
            }
        ];
    }

    function getGeneralPropertyConstructorsForDomElement() {
        return [
            {
                name: 'exists',
                isSuitable: function () {
                    return true;
                },
                getValue: function () {
                    return true;
                },
                generateGetter: function (selector) {
                    return '!!(' + selector + ')';
                },
                isDefault: true
            },
            {
                name: 'text',
                isSuitable: function () {
                    return true;
                },
                getValue: function (obj) {
                    return obj.textContent;
                },
                generateGetter: function (selector) {
                    return selector + '.textContent';
                }
            },
            {
                name: 'value',
                isSuitable: function (obj) {
                    return hasValueProperty(obj);
                },
                getValue: function (obj) {
                    return obj.value;
                },
                generateGetter: function (selector) {
                    return selector + '.value';
                }
            },
            {
                name: 'selectedIndex',
                isSuitable: function (obj) {
                    return hasSelectedIndexProperty(obj);
                },
                getValue: function (obj) {
                    return obj.selectedIndex;
                },
                generateGetter: function (selector) {
                    return selector + '.selectedIndex';
                }
            },
            {
                name: 'checked',
                isSuitable: function (obj) {
                    return hasCheckedProperty(obj);
                },
                getValue: function (obj) {
                    return obj.checked;
                },
                generateGetter: function (selector) {
                    return selector + '.checked';
                }
            },
            {
                name: 'visible',
                isSuitable: function () {
                    return true;
                },
                getValue: function (obj) {
                    return $(obj).is(':visible');
                },
                generateGetter: function (selector) {
                    return '$(' + selector + ').is(":visible")';
                }
            },
            {
                name: 'class',
                isSuitable: function () {
                    return true;
                },
                getValue: function (obj) {
                    return obj.className;
                },
                generateGetter: function (selector) {
                    return selector + '.className';
                }
            },
            {
                name: 'child element count',
                isSuitable: function () {
                    return true;
                },
                getValue: function (obj) {
                    return obj.childElementCount;
                },
                generateGetter: function (selector) {
                    return selector + '.childElementCount';
                }
            },
            {
                name: 'width',
                isSuitable: function () {
                    return true;
                },
                getValue: function (obj) {
                    return obj.offsetWidth;
                },
                generateGetter: function (selector) {
                    return selector + '.offsetWidth';
                }
            },
            {
                name: 'height',
                isSuitable: function () {
                    return true;
                },
                getValue: function (obj) {
                    return obj.offsetHeight;
                },
                generateGetter: function (selector) {
                    return selector + '.offsetHeight';
                }
            },
            {
                name: 'left',
                isSuitable: function () {
                    return true;
                },
                getValue: function (obj) {
                    return $(obj).offset().left;
                },
                generateGetter: function (selector) {
                    return '$(' + selector + ').offset().left';
                }
            },
            {
                name: 'top',
                isSuitable: function () {
                    return true;
                },
                getValue: function (obj) {
                    return $(obj).offset().top;
                },
                generateGetter: function (selector) {
                    return '$(' + selector + ').offset().top';
                }
            }
        ];
    }

    function getGeneralPropertyConstructorsForCollection() {
        return [
            {
                name: 'length',
                isSuitable: function () {
                    return true;
                },
                getValue: function (obj) {
                    return obj.length;
                },
                generateGetter: function (selector) {
                    return selector + '.length';
                },
                isDefault: true
            }
        ];
    }

    function hasValueProperty(el) {
        return el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'button' || el.tagName.toLowerCase() === 'select';
    }

    function hasCheckedProperty(el) {
        return el.tagName.toLowerCase() === 'input' && el.getAttribute('type') === 'checkbox';
    }

    function hasSelectedIndexProperty(el) {
        return el.tagName.toLowerCase() === 'select';
    }

    function getGeneralProperties(obj, selector, callback, context) {
        function onMessage(e) {
            if (e.message.cmd === IFrameMessages.GENERATE_GENERAL_PROPERTIES_IN_IFRAME_RESPONSE_CMD) {
                callback(e.message.properties);
                MessageSandbox.off(MessageSandbox.SERVICE_MSG_RECEIVED, onMessage);
            }
        }

        if (context) {
            MessageSandbox.on(MessageSandbox.SERVICE_MSG_RECEIVED, onMessage);

            var msg = {
                cmd: IFrameMessages.GENERATE_GENERAL_PROPERTIES_IN_IFRAME_REQUEST_CMD,
                selector: selector
            };

            MessageSandbox.sendServiceMsg(msg, context);

            return;
        }

        if (!obj)
            obj = JavascriptExecutor.parseSelectorSync(selector).evalResults;

        var propertyConstructors,
            generalProperties = [];

        if (Util.isJQueryObj(obj))
            propertyConstructors = getGeneralPropertyConstructorsForJQueryObject();
        else if (Util.isDomElement(obj))
            propertyConstructors = getGeneralPropertyConstructorsForDomElement();
        else if ($.isArray(obj) || obj instanceof NodeList || obj instanceof HTMLCollection)
            propertyConstructors = getGeneralPropertyConstructorsForCollection();
        else {
            callback(generalProperties);
            return;
        }

        for (var i = 0; i < propertyConstructors.length; i++)
            if (propertyConstructors[i].isSuitable(obj))
                generalProperties.push({
                    name: propertyConstructors[i].name,
                    value: propertyConstructors[i].getValue(obj),
                    getter: propertyConstructors[i].generateGetter(selector),
                    isDefault: propertyConstructors[i].isDefault || false
                });

        callback(generalProperties);
    }

    function getCssProperties(obj, selector, callback, context) {
        function onMessage(e) {
            if (e.message.cmd === IFrameMessages.GENERATE_CSS_PROPERTIES_IN_IFRAME_RESPONSE_CMD) {
                callback(e.message.properties);
                MessageSandbox.off(MessageSandbox.SERVICE_MSG_RECEIVED, onMessage);
            }
        }

        if (context) {
            MessageSandbox.on(MessageSandbox.SERVICE_MSG_RECEIVED, onMessage);

            var msg = {
                cmd: IFrameMessages.GENERATE_CSS_PROPERTIES_IN_IFRAME_REQUEST_CMD,
                selector: selector
            };

            MessageSandbox.sendServiceMsg(msg, context);

            return;
        }

        if (!obj)
            obj = JavascriptExecutor.parseSelectorSync(selector).evalResults;

        var getterGenerator,
            $el,
            propertyNames = [],
            cssProperties = [];

        if (Util.isJQueryObj(obj) && obj.length) {
            $el = obj;
            getterGenerator = function (selector, propertyName) {
                return selector + '.css("' + propertyName + '")';
            };
        }
        else if (Util.isDomElement(obj)) {
            $el = $(obj);
            getterGenerator = function (selector, propertyName) {
                return '$(' + selector + ').css("' + propertyName + '")';
            };
        }
        else {
            callback(cssProperties);
            return;
        }

        for (var propertyName in $el[0].style) {
            if (!/[^a-z\-]/i.test(propertyName))
                propertyNames.push(propertyName);
        }

        propertyNames.sort(function (name1, name2) {
            return name1.toLowerCase().localeCompare(name2.toLowerCase());
        });

        for (var i = 0; i < propertyNames.length; i++) {
            var propertyValue = $el.css(propertyNames[i]);
            if (typeof propertyValue !== 'object')
                cssProperties.push({
                    name: propertyNames[i],
                    value: propertyValue,
                    getter: getterGenerator(selector, propertyNames[i])
                });
        }

        callback(cssProperties);
    }

    function getAttributes(obj, selector, callback, context) {
        function onMessage(e) {
            if (e.message.cmd === IFrameMessages.GENERATE_ATTRIBUTES_IN_IFRAME_RESPONSE_CMD) {
                callback(e.message.properties);
                MessageSandbox.off(MessageSandbox.SERVICE_MSG_RECEIVED, onMessage);
            }
        }

        if (context) {
            MessageSandbox.on(MessageSandbox.SERVICE_MSG_RECEIVED, onMessage);

            var msg = {
                cmd: IFrameMessages.GENERATE_ATTRIBUTES_IN_IFRAME_REQUEST_CMD,
                selector: selector
            };

            MessageSandbox.sendServiceMsg(msg, context);

            return;
        }

        if (!obj)
            obj = JavascriptExecutor.parseSelectorSync(selector).evalResults;

        var res = [],
            attributes = Hammerhead.getOriginElementAttributes(obj[0]);

        if (!attributes)
            callback(null);
        else {
            for (var i = 0; i < attributes.length; i++) {
                res.push({
                    name: attributes[i].name,
                    value: obj[0].getAttribute(attributes[i].name),
                    getter: selector + '.attr("' + attributes[i].name + '")'
                });
            }

            callback(res);
        }
    }

    exports.getGeneralProperties = getGeneralProperties;
    exports.getCssProperties = getCssProperties;
    exports.getAttributes = getAttributes;
});
TestCafeClient.define('Recorder.Recorder', function (require) {
    var Hammerhead = HammerheadClient.get('Hammerhead'),
        $ = Hammerhead.$,
        MessageSandbox = Hammerhead.MessageSandbox,
        Util = Hammerhead.Util,

        Automation = require('Automation'),
        ElementPicker = require('Recorder.ElementPicker'),
        EventListener = require('Recorder.EventListener'),
        JavascriptExecutor = require('Base.JavascriptExecutor'),
        ModalBackground = require('UI.ModalBackground'),
        RecorderBase = require('Recorder.RecorderBase'),
        RecorderUI = require('UI.Recorder'),
        RecorderUtil = require('Recorder.Util'),
        SelectorGenerator = require('Recorder.SelectorGenerator'),
        ServiceCommands = require('Shared.ServiceCommands'),
        Settings = require('Settings'),
        SharedConst = require('Shared.Const'),
        Tooltip = require('UI.RecorderWidgets.Tooltip'),
        Transport = require('Base.Transport'),

        UXLog = require('UI.UXLog');


    var ACTION_WAIT_DEFAULT_VALUE = 1000,

        UPLOAD_CLEARED_MESSAGE = 'The file input was cleared.',
        UPLOAD_ERROR_MESSAGE = 'Cannot copy a file to the test folder. Probably, TestCafe does not have rights to do this or the hard disk is full.',
        UPLOAD_LOADING_PANEL_DELAY = 750,
        UPLOAD_MESSAGE_TEMPLATE = 'The following files have been copied to the test folder:<br><br>%s';

    //Util
    function createExecutableShortcutHandler(shortcut) {
        return {
            start: function () {
                EventListener.setPreventingMode(true);
            },
            end: function () {
                RecorderUI.Shortcuts[shortcut]();
                EventListener.setPreventingMode(false);
            },
            multiple: false
        };
    }

    //Recorder
    var Recorder = this.exports = function (storedNativeDialogs) {
        var recorder = this;

        RecorderBase.apply(this, [storedNativeDialogs]);

        this.stepsInfo = [];
        this.hasUnsavedChanges = false;
        this.testSaved = false;

        this.uploadingInProcess = false;
        this.elementPickingInProcess = false;
        this.paused = false;
        this.nativeDialogQueue = Settings.NATIVE_DIALOGS_QUEUE || [];

        if (!RecorderUI.isInitialized()) {
            RecorderUI.init(function () {
                    return recorder.stepsInfo;
                }, function () {
                    return recorder.hasUnsavedChanges;
                },
                function () {
                    return recorder.testSaved;
                }, Settings.SHOW_STEPS);
        }

        RecorderUI.events.on(RecorderUI.START_PICKING_ELEMENT_EVENT, function (e) {
            recorder._startPickingElement(function (elementSelectors, iFrameSelectors) {
                e.callback(elementSelectors, iFrameSelectors);
            }, e.iFrameContext);
        });

        RecorderUI.events.on(RecorderUI.STOP_PICKING_ELEMENT_EVENT, function () {
            RecorderUI.onStopPickElement();
        });
    };

    Util.inherit(Recorder, RecorderBase);

    Recorder.prototype.loadStepsInfo = function (callback) {
        var recorder = this;

        Transport.asyncServiceMsg({cmd: ServiceCommands.STEPS_INFO_GET}, function (res) {
            recorder.stepsInfo = [];

            var resStepsInfo = res.stepsInfo || [];

            for (var i = 0; i < resStepsInfo.length; i++)
                recorder.stepsInfo.push(RecorderUtil.parseServerCompatibleStepInfo(resStepsInfo[i]));

            recorder.hasUnsavedChanges = res.hasUnsavedChanges || false;
            recorder.testSaved = res.testSaved || false;

            //NOTE: we set actual step on recorder init
            callback(recorder.stepsInfo, recorder.hasUnsavedChanges);
        });
    };

    Recorder.prototype.start = function (initIFrameNativeDialogs) {
        UXLog.write('Recording started');
        Recorder.base.start.call(this, initIFrameNativeDialogs);
        this._checkNativeDialogsQueue();
    };

    Recorder.prototype._parseAndSendStepsInfo = function (callback) {
        $.each(this.stepsInfo, function (index, value) {
            RecorderUtil.parseStepArguments(value);
        });

        RecorderUtil.sendStepsInfo(this.stepsInfo, this.hasUnsavedChanges, callback);
    };

    Recorder.prototype._setDialogHandler = function (stepInfo, dialog, retValue) {
        this._setHasUnsavedChanges(true);

        if (!stepInfo.nativeDialogHandlers)
            stepInfo.nativeDialogHandlers = [];

        var dialogIndex = RecorderUtil.BROWSER_DIALOG_INDEXES[dialog],
            dialogHandler = {
                dialog: dialog,
                retValue: retValue
            };

        if (stepInfo.nativeDialogHandlers[dialogIndex] && stepInfo.nativeDialogHandlers[dialogIndex].length)
            stepInfo.nativeDialogHandlers[dialogIndex].push(dialogHandler);
        else
            stepInfo.nativeDialogHandlers[dialogIndex] = [dialogHandler];


        RecorderUtil.sendStepsInfo(this.stepsInfo, true);
        RecorderUI.handlerAdded(dialog);
    };

    Recorder.prototype._saveDialogHandler = function (dialog, retValue) {
        var recorder = this;

        //NOTE: the following dialogs are not raised in browsers after before unload event
        if (/alert|confirm|prompt/.test(dialog) && this.beforeUnloadEventWasRaised)
            return;

        function saveDialogHandler(stepNum, dialog, retValue) {
            var stepInfo = recorder.stepsInfo[stepNum];

            if (stepInfo)
                recorder._setDialogHandler(stepInfo, dialog, retValue);
            else {
                //NOTE: for dialogs before other test actions and before start recording
                var dialogIndex = RecorderUtil.BROWSER_DIALOG_INDEXES[dialog],
                    dialogHandler = {
                        dialog: dialog,
                        retValue: retValue
                    };

                if (recorder.nativeDialogQueue[dialogIndex] && recorder.nativeDialogQueue[dialogIndex].length)
                    recorder.nativeDialogQueue[dialogIndex].push(dialogHandler);
                else
                    recorder.nativeDialogQueue[dialogIndex] = [dialogHandler];


                Transport.asyncServiceMsg({
                    cmd: ServiceCommands.SET_NATIVE_DIALOGS_QUEUE,
                    queue: recorder.nativeDialogQueue
                });
            }
        }

        function getStepNumberForCurrentNativeDialogHandler() {
            var stepsLength = recorder.stepsInfo.length;

            if (recorder.uploadingInProcess || recorder.elementPickingInProcess)
                return stepsLength;

            //NOTE: action saved before the its handlers are raised (B251638)
            return stepsLength ? stepsLength - 1 : 0;
        }

        //NOTE: for Mozilla we should save native dialog immediately (before reload the page)
        if (Util.isMozilla && dialog === 'beforeUnload')
            recorder._setDialogHandler(recorder.stepsInfo[recorder.stepsInfo.length - 1], 'beforeUnload');
        else
            saveDialogHandler(getStepNumberForCurrentNativeDialogHandler(), dialog, retValue);
    };

    Recorder.prototype._checkNativeDialogsQueue = function () {
        var recorder = this;

        $.each(this.nativeDialogQueue, function (index, dialogs) {
            if (dialogs) {
                $.each(dialogs, function (i, dialog) {
                    var stepInfo = recorder.stepsInfo[recorder.stepsInfo.length - 1];

                    if (stepInfo)
                        recorder._setDialogHandler(stepInfo, dialog.dialog, dialog.retValue);
                });
            }
        });

        this.nativeDialogQueue = [];
    };

    Recorder.prototype._setHasUnsavedChanges = function (hasUnsavedChanges, sendServiceMessage) {
        this.hasUnsavedChanges = hasUnsavedChanges;
        RecorderUI.updateToolbarButtons();

        if (sendServiceMessage) {
            var unsavedChangesMsg = {
                cmd: ServiceCommands.SET_HAS_UNSAVED_CHANGES,
                hasUnsavedChanges: hasUnsavedChanges
            };

            Transport.asyncServiceMsg(unsavedChangesMsg, function () {
                RecorderUI.updateToolbarButtons();
            });
        }
    };

    Recorder.prototype._saveStep = function (stepInfo, overwriteLastStep) {
        RecorderUtil.parseStepArguments(stepInfo);

        this._checkNativeDialogsQueue();

        if (overwriteLastStep)
            this.stepsInfo[this.stepsInfo.length - 1] = stepInfo;
        else
            this.stepsInfo.splice(this.stepsInfo.length, 0, stepInfo);

        this._setHasUnsavedChanges(true);
        RecorderUtil.sendStepsInfo(this.stepsInfo, this.hasUnsavedChanges);

        if (!overwriteLastStep)
            RecorderUI.stepAdded(stepInfo);

        if (stepInfo.isAssertion)
            UXLog.write('Assertion is saved');
        else
            UXLog.write('Action is saved: ' + stepInfo.actionDescriptor.type);
    };

    Recorder.prototype._startPickingElement = function (callback, iframeContext) {
        var recorder = this;

        this.elementPickingInProcess = true;
        Recorder.base._startPickingElement.call(this);

        this.elementPickCallback = function (elementSelectors, iFrameSelectors, options) {
            recorder._stopPickingElement();
            callback(elementSelectors, iFrameSelectors, options);
        };

        ElementPicker.start(this.elementPickCallback, iframeContext);

        RecorderUI.onStartPickElement();

        var msg = {
            cmd: RecorderBase.IFRAME_START_PICKING_ELEMENT_CMD
        };

        if (iframeContext)
            MessageSandbox.sendServiceMsg(msg, iframeContext);
        else
            this._sendMessageToAllIFrame(msg);
    };

    Recorder.prototype._stopPickingElement = function () {
        this.elementPickingInProcess = false;
        Recorder.base._stopPickingElement.call(this);

        this._sendMessageToAllIFrame({
            cmd: RecorderBase.IFRAME_STOP_PICKING_ELEMENT_CMD
        });
    };

    Recorder.prototype._exitRecording = function () {
        var recorder = this;

        this.recording = false;

        Transport.asyncServiceMsg({
            cmd: ServiceCommands.EXIT_RECORDING
        }, function (res) {
            var fixtureFilename = res.fixtureFilename;

            if (!res.err) {
                recorder.recording = false;
                window.location.href = Settings.RETURN_URL + Settings.FIXTURE_FILE_NAME_PARAM + fixtureFilename;
            }
        });
    };

    //Ui
    Recorder.prototype._initUi = function () {
        RecorderUI.activateRecordingMode();

        this.recordingManagerOptions.typingStateChangedCallback = RecorderUI.onTypingStateChanged;
        this.recordingManagerOptions.clickEditorStateChangedCallback = RecorderUI.onClickEditorStateChanged;

        if (!RecorderUI.Shortcuts)
            this.recordingManagerOptions.executableShortcuts = {};
        else {
            for (var executableShortcut in RecorderUI.Shortcuts) {
                if (RecorderUI.Shortcuts.hasOwnProperty(executableShortcut))
                    this.recordingManagerOptions.executableShortcuts[executableShortcut] = createExecutableShortcutHandler(executableShortcut);
            }
        }
    };

    Recorder.prototype._initRecordingUiEventHandling = function () {
        var recorder = this,
            paused = false;

        function pauseEventListening() {
            if (!paused) {
                paused = true;
                EventListener.pause();
            }
        }

        function resumeEventListening() {
            if (paused) {
                paused = false;
                EventListener.resume();
            }
        }

        RecorderUI.events.on(RecorderUI.ADD_HOVER_ACTION_EVENT, function () {
            //NOTE: we set this flag here again only for 'toolbar button press' handler
            EventListener.setPreventingMode(true);

            recorder._createAllDeferred();

            recorder._sendMessageToAllIFrame({
                cmd: RecorderBase.IFRAME_CREATE_ALL_DEFERRED_ACTIONS_CMD
            });

            EventListener.pause();
            recorder._startPickingElement(function (elementSelectors, iFrameSelectors, options) {
                RecorderUI.onStopPickElement();
                EventListener.resume();

                if (!elementSelectors)
                    return;

                if (iFrameSelectors) {
                    var iFrame = JavascriptExecutor.parseSelectorSync(iFrameSelectors[0].selector).$elements[0];

                    MessageSandbox.sendServiceMsg({
                        cmd: RecorderBase.IFRAME_HOVER_ACTION_RECORDED_CMD,
                        elementSelectors: elementSelectors,
                        iFrameSelectors: iFrameSelectors,
                        options: options
                    }, iFrame.contentWindow);
                }
                else {
                    var actionDescriptor = $.extend(Automation.defaultMouseActionDescriptor, {
                        type: 'hover',
                        element: JavascriptExecutor.parseSelectorSync(elementSelectors[0].selector).$elements[0],
                        apiArguments: {
                            options: options
                        },
                        selector: elementSelectors[0].selector,
                        serviceInfo: {
                            selectors: elementSelectors
                        }
                    });

                    recorder._onActionParsed(actionDescriptor);
                }
            });

            EventListener.setPreventingMode(false);
        });

        RecorderUI.events.on(RecorderUI.ADD_WAIT_ACTION_EVENT, function () {
            //NOTE: we set this flag here again only for 'toolbar button press' handler (to force create deferred action)
            EventListener.setPreventingMode(true);

            recorder._createAllDeferred();

            //NOTE: deferred actions in an iframe don't have time to be created
            recorder._sendMessageToAllIFrame({
                cmd: RecorderBase.IFRAME_CREATE_ALL_DEFERRED_ACTIONS_CMD
            });

            var actionDescriptor = $.extend(Automation.defaultWaitActionDescriptor, {
                apiArguments: { ms: ACTION_WAIT_DEFAULT_VALUE }
            });

            //NOTE: for wait action we should always use confirm dialog
            recorder._onActionParsed(actionDescriptor, true);


            EventListener.setPreventingMode(false);
        });

        RecorderUI.events.on(RecorderUI.ADD_SCREENSHOT_ACTION_EVENT, function () {
            //NOTE: we set this flag here again only for 'toolbar button press' handler (to force create deferred action)
            EventListener.setPreventingMode(true);

            recorder._createAllDeferred();

            //NOTE: deferred actions in an iframe don't have time to be created
            recorder._sendMessageToAllIFrame({
                cmd: RecorderBase.IFRAME_CREATE_ALL_DEFERRED_ACTIONS_CMD
            });

            //NOTE: for wait action we should always use confirm dialog
            recorder._onActionParsed(Automation.defaultScreenshotActionDescriptor);

            EventListener.setPreventingMode(false);
        });

        RecorderUI.events.on(RecorderUI.ADD_ASSERTIONS_STEP_EVENT, function () {
            var isPrevStepAssertion = recorder.stepsInfo.length && recorder.stepsInfo[recorder.stepsInfo.length - 1].isAssertion,
                stepNum = isPrevStepAssertion ? recorder.stepsInfo.length : recorder.stepsInfo.length + 1,
                stepInfo = isPrevStepAssertion ? recorder.stepsInfo[recorder.stepsInfo.length - 1] : RecorderUtil.getAssertionsStepInfo();

            RecorderUI.confirmAction(stepNum, stepInfo, function (confirmed, stepInfo) {
                if (confirmed)
                    recorder._saveStep(stepInfo, isPrevStepAssertion);
            });
        });

        RecorderUI.events.on(RecorderUI.RUN_PLAYBACK_EVENT, function () {

            RecorderUI.hideToolbar();
            ModalBackground.show();
            ModalBackground.showLoadingIcon();

            recorder.recording = false;
            Transport.asyncServiceMsg({cmd: ServiceCommands.START_PLAYBACK}, function (res) {
                if (res.err)
                    window.location.href = Settings.RETURN_URL;
                else
                    Transport.switchToStartRecordingUrl(res.recordingUrl);
            });
        });

        RecorderUI.events.on(RecorderUI.SAVE_TEST_EVENT, function (e) {
            recorder.recording = false;

            Transport.asyncServiceMsg({
                cmd: ServiceCommands.SAVE_TEST,
                testName: e.testName
            }, function (res) {
                var err = res.err;

                if (!err)
                    recorder._setHasUnsavedChanges(false, true);

                e.callback(err);

                if (!err) {
                    recorder.recording = true;
                    recorder.testSaved = true;

                    if (e.complete)
                        recorder._exitRecording();
                }
            });
        });

        RecorderUI.events.on(RecorderUI.EXIT_RECORDING_EVENT, function (e) {
            if (e && e.skipCheckChanges) {
                recorder._exitRecording();
                return;
            }

            //T183278 - Recorder stops work after click 'Cancel' button in 'Unsaved changes dialog'
            //We should not stop listener, we just need create deferred actions
            EventListener.createAllDeferred();

            if (!recorder.hasUnsavedChanges)
                recorder._exitRecording();
            else
                RecorderUI.openChangesWarningDialog(e && e.hasErrors);
        });

        RecorderUI.events.on(RecorderUI.RESTART_RECORDING_EVENT, function () {
            recorder.recording = false;
            Transport.asyncServiceMsg({cmd: ServiceCommands.RESTART_RECORDING}, function (res) {
                if (res.err)
                    window.location.href = Settings.RETURN_URL;
                else
                    Transport.switchToStartRecordingUrl(res.recordingUrl);
            });
        });

        RecorderUI.events.on(RecorderUI.SEND_STEPS_INFO_EVENT, function () {
            recorder._setHasUnsavedChanges(!!recorder.stepsInfo.length);
            recorder._parseAndSendStepsInfo();
        });

        RecorderUI.events.on(RecorderUI.POPUP_DIALOG_OPENING_EVENT, pauseEventListening);

        RecorderUI.events.on(RecorderUI.POPUP_DIALOG_CLOSED_EVENT, function (e) {
            if (e.needSendStepsInfo)
                recorder._parseAndSendStepsInfo();

            resumeEventListening();
        });

        RecorderUI.events.on(RecorderUI.STEP_EDITING_STARTED, pauseEventListening);

        RecorderUI.events.on(RecorderUI.STEP_EDITING_FINISHED, resumeEventListening);
    };

    // Upload
    Recorder.prototype._startUpload = function (completed, callback) {
        var uploaded = false,
            upload_errs = null;

        ModalBackground.show();
        ModalBackground.showLoadingIcon();
        RecorderUI.hideToolbar();

        var loadingPanelTimeout = window.setTimeout(function () {
            loadingPanelTimeout = null;

            if (uploaded)
                completed(upload_errs);
        }, UPLOAD_LOADING_PANEL_DELAY);

        callback(function (errs) {
            uploaded = true;
            upload_errs = !!errs.length;

            if (!loadingPanelTimeout)
                completed(upload_errs);
        });
    };

    Recorder.prototype._uploadCompleted = function (fileNames, filePaths, errs) {
        var message = errs ? UPLOAD_ERROR_MESSAGE : UPLOAD_MESSAGE_TEMPLATE.replace('%s', filePaths.join('<br>'));

        if (errs)
            message = UPLOAD_ERROR_MESSAGE;
        else {
            if (filePaths.join(''))
                message = UPLOAD_MESSAGE_TEMPLATE.replace('%s', filePaths.join('<br>'));
            else
                message = UPLOAD_CLEARED_MESSAGE;
        }

        RecorderUI.showToolbar();
        ModalBackground.hideLoadingIcon();
        ModalBackground.hide();

        Tooltip.show(message);
    };

    Recorder.prototype._initHammerheadEventHandling = function () {
        var recorder = this;

        Hammerhead.on(Hammerhead.FILE_UPLOADING_EVENT, function (fileNames, input, callback) {
            recorder.uploadingInProcess = true;

            var selectors = SelectorGenerator.generate($(input));

            recorder._startUpload(function (errs) {
                recorder.uploadingInProcess = false;
                var filePaths = fileNames.map(function (name) {
                    return SharedConst.UPLOADED_FILES_PATH + name;
                });

                recorder._uploadCompleted(fileNames, filePaths, errs);

                recorder._onActionParsed({
                    type: 'upload',
                    apiArguments: {
                        files: filePaths
                    },
                    serviceInfo: {
                        selectors: selectors,
                        fileNames: fileNames
                    }
                });
            }, callback);
        });
    };

    Recorder.prototype._onUploadRequested = function (fileNames, selectors, owner) {
        var recorder = this,
            filePaths = fileNames.map(function (name) {
                return SharedConst.UPLOADED_FILES_PATH + name;
            });

        recorder._startUpload(function (errs) {
            recorder._uploadCompleted(fileNames, filePaths, errs);
        }, function (completed) {
            MessageSandbox.sendServiceMsg({
                cmd: RecorderBase.IFRAME_UPLOAD_ALLOWED_CMD
            }, owner);

            var onUploadCompleted = function (e) {
                if (e.message.cmd === RecorderBase.IFRAME_UPLOAD_COMPLETED_CMD) {
                    MessageSandbox.off(MessageSandbox.SERVICE_MSG_RECEIVED, onUploadCompleted);
                    completed(e.message.errs);
                }
            };

            MessageSandbox.on(MessageSandbox.SERVICE_MSG_RECEIVED, onUploadCompleted);
        });
    };

    //Recording management
    Recorder.prototype._confirmAction = function (parsedStepInfo, callback) {
        RecorderUI.confirmAction(this.stepsInfo.length + 1, parsedStepInfo, callback);
    };
});

TestCafeClient.define('Recorder.RecorderBase', function (require) {
    var Hammerhead = HammerheadClient.get('Hammerhead'),
        $ = Hammerhead.$,
        Util = Hammerhead.Util,
        MessageSandbox = Hammerhead.MessageSandbox,
        Settings = require('Settings'),
        EventListener = require('Recorder.EventListener'),
        Automation = require('Automation'),
        AutomationIFrameBehavior = require('Automation.IFrameBehavior'),
        JavaScriptExecutor = require('Base.JavascriptExecutor'),
        RecorderUtil = require('Recorder.Util'),
        SelectorGenerator = require('Recorder.SelectorGenerator'),
        CursorWidget = require('UI.Cursor'),
        ElementPicker = require('Recorder.ElementPicker'),
        IFrameMessages = require('Base.CrossDomainMessages'),
        PropertyListGenerator = require('Recorder.PropertyListGenerator'),
        Assertions = require('TestRunner.API.Assertions'),
        ObjectViewer = require('UI.RecorderWidgets.ObjectViewer');

    var RecorderBase = this.exports = function (storedNativeDialogs) {
        this.eventEmitter = new Util.EventEmitter();
        this.waitingIframeRecorders = [];
        this.iFrameListeners = [];

        this.recordingManagerOptions = {
            recordableShortcutList: Automation.SUPPORTED_SHORTCUTS,
            executableShortcuts: {}
        };
        this.elementPickCallback = null;
        this.beforeUnloadEventWasRaised = false;
        this.nativeDialogs = storedNativeDialogs;

        this._initIFrameBehavior();

        if (!Settings.PLAYBACK)
            this.initNativeDialogsHandling();
    };

    RecorderBase.IFRAME_RECORDER_INITIALIZED_CMD = 'iframeRecorderInitialized';
    RecorderBase.START_IFRAME_RECORDER_CMD = 'startIframeRecorder';
    RecorderBase.IFRAME_SAVE_STEP_REQUEST_CMD = 'saveStepRequest';
    RecorderBase.IFRAME_SAVE_STEP_RESPONSE_CMD = 'saveStepResponse';
    RecorderBase.IFRAME_UPLOAD_ALLOWED_CMD = 'iframeUploadAllowed';
    RecorderBase.IFRAME_UPLOAD_COMPLETED_CMD = 'iframeUploadCompleted';
    RecorderBase.IFRAME_UPLOAD_REQUEST_TO_UPLOAD_CMD = 'iframeRequestToUpload';
    RecorderBase.IFRAME_CONFIRM_ACTION_REQUEST_CMD = 'confirmActionRequest';
    RecorderBase.IFRAME_CONFIRM_ACTION_RESPONSE_CMD = 'confirmActionResponse';
    RecorderBase.IFRAME_TYPING_STATE_CHANGED_REQUEST_CMD = 'typingStateChangedRequest';
    RecorderBase.IFRAME_TYPING_STATE_CHANGED_RESPONSE_CMD = 'typingStateChangedResponse';
    RecorderBase.IFRAME_CLICK_EDITOR_STATE_CHANGED_REQUEST_CMD = 'clickEditorStateChangedRequest';
    RecorderBase.IFRAME_CLICK_EDITOR_STATE_CHANGED_RESPONSE_CMD = 'clickEditorStateChangedResponse';
    RecorderBase.IFRAME_SHORTCUT_PRESSED_START_CMD = 'shortcutPressedStart';
    RecorderBase.IFRAME_SHORTCUT_PRESSED_END_CMD = 'shortcutPressedEnd';
    RecorderBase.IFRAME_SAVE_DIALOG_HANDLER_CMD = 'saveDialogHandler';
    RecorderBase.IFRAME_START_PICKING_ELEMENT_CMD = 'iFrameStartPickingElement';
    RecorderBase.IFRAME_STOP_PICKING_ELEMENT_CMD = 'iFrameStopPickingElement';
    RecorderBase.IFRAME_ELEMENT_PICKED_CMD = 'iFrameElementPicked';
    RecorderBase.IFRAME_HOVER_ACTION_RECORDED_CMD = 'iFrameHoverActionRecorded';
    RecorderBase.IFRAME_CREATE_ALL_DEFERRED_ACTIONS_CMD = 'iFrameCreateAllDeferredActions';

    RecorderBase.prototype.on = function () {
        return this.eventEmitter.on.apply(this.eventEmitter, arguments);
    };

    function addIFrameSelectorsToStepInfo(windowObj, stepInfo) {
        var iFrame = Util.getIFrameByWindow(windowObj);

        stepInfo = RecorderUtil.parseStepInfo(stepInfo);

        if (!stepInfo.iFrameSelectors)
            stepInfo.iFrameSelectors = SelectorGenerator.generate($(iFrame));

        return stepInfo;
    }

    RecorderBase.prototype._initIFrameBehavior = function () {
        var recorder = this;

        AutomationIFrameBehavior.init();

        MessageSandbox.on(MessageSandbox.SERVICE_MSG_RECEIVED, function (e) {
            var message = e.message,
                source = e.source,
                responseMessage = null,
                pos = null,
                rect = null;

            switch (message.cmd) {
                case RecorderBase.IFRAME_UPLOAD_REQUEST_TO_UPLOAD_CMD:
                    recorder._onUploadRequested(message.fileNames, message.selectors, source);
                    break;

                case RecorderBase.IFRAME_RECORDER_INITIALIZED_CMD:
                    if (recorder.started)
                        MessageSandbox.sendServiceMsg({
                            cmd: RecorderBase.START_IFRAME_RECORDER_CMD
                        }, source);
                    else
                        recorder.waitingIframeRecorders.push(source);

                    if ($.inArray(source, recorder.iFrameListeners) < 0)
                        recorder.iFrameListeners.push(source);
                    break;

                case RecorderBase.IFRAME_SAVE_STEP_REQUEST_CMD:
                    recorder._saveStep(addIFrameSelectorsToStepInfo(source, message.stepInfo));

                    if (Util.getIFrameByWindow(source)) {   //NOTE: iFrame may be removed (T239647)
                        MessageSandbox.sendServiceMsg({
                            cmd: RecorderBase.IFRAME_SAVE_STEP_RESPONSE_CMD
                        }, source);
                    }
                    break;

                case RecorderBase.IFRAME_CONFIRM_ACTION_REQUEST_CMD:
                    recorder._confirmAction(addIFrameSelectorsToStepInfo(source, message.stepInfo), function (confirmed, stepInfo) {
                        responseMessage = {
                            cmd: RecorderBase.IFRAME_CONFIRM_ACTION_RESPONSE_CMD,
                            confirmed: confirmed,
                            stepInfo: stepInfo ? RecorderUtil.serializeStepInfo(stepInfo) : null
                        };

                        MessageSandbox.sendServiceMsg(responseMessage, source);
                    });
                    break;

                case RecorderBase.IFRAME_TYPING_STATE_CHANGED_REQUEST_CMD:
                    if (message.isTypingStarted) {
                        pos = Util.getFixedPosition({x: message.rect.left, y: message.rect.top}, source);
                        rect = {
                            left: pos.x,
                            top: pos.y,
                            width: message.rect.width,
                            height: message.rect.height
                        };
                    }

                    recorder.recordingManagerOptions.typingStateChangedCallback(message.isTypingStarted, function () {
                        MessageSandbox.sendServiceMsg({cmd: RecorderBase.IFRAME_TYPING_STATE_CHANGED_RESPONSE_CMD}, source);
                    }, rect);

                    break;

                case RecorderBase.IFRAME_CLICK_EDITOR_STATE_CHANGED_REQUEST_CMD:
                    if (message.isClickOnEditorStarted) {
                        pos = Util.getFixedPosition({x: message.rect.left, y: message.rect.top}, source);
                        rect = {
                            left: pos.x,
                            top: pos.y,
                            width: message.rect.width,
                            height: message.rect.height
                        };
                    }

                    recorder.recordingManagerOptions.clickEditorStateChangedCallback(message.isClickOnEditorStarted, function () {
                        MessageSandbox.sendServiceMsg({cmd: RecorderBase.IFRAME_CLICK_EDITOR_STATE_CHANGED_RESPONSE_CMD}, source);
                    }, rect);

                    break;

                case RecorderBase.IFRAME_SHORTCUT_PRESSED_START_CMD:
                    if (typeof recorder.recordingManagerOptions.executableShortcuts[message.shortcut].start === 'function')
                        recorder.recordingManagerOptions.executableShortcuts[message.shortcut].start();

                    else if (typeof recorder.recordingManagerOptions.executableShortcuts[message.shortcut] === 'function')
                        recorder.recordingManagerOptions.executableShortcuts[message.shortcut]();

                    break;

                case RecorderBase.IFRAME_SHORTCUT_PRESSED_END_CMD:
                    if (typeof recorder.recordingManagerOptions.executableShortcuts[message.shortcut].end === 'function')
                        recorder.recordingManagerOptions.executableShortcuts[message.shortcut].end();

                    break;

                case RecorderBase.IFRAME_SAVE_DIALOG_HANDLER_CMD:
                    recorder._saveDialogHandler(message.dialog, message.retValue);
                    break;

                case RecorderBase.IFRAME_ELEMENT_PICKED_CMD:
                    recorder.elementPickCallback(message.elementSelector, message.iFrameSelectors, message.options);
                    break;

                case IFrameMessages.GENERATE_GENERAL_PROPERTIES_IN_IFRAME_REQUEST_CMD:
                    PropertyListGenerator.getGeneralProperties(null, message.selector, function (properties) {
                        responseMessage = {
                            cmd: IFrameMessages.GENERATE_GENERAL_PROPERTIES_IN_IFRAME_RESPONSE_CMD,
                            properties: properties
                        };

                        MessageSandbox.sendServiceMsg(responseMessage, source);
                    });
                    break;

                case IFrameMessages.GENERATE_CSS_PROPERTIES_IN_IFRAME_REQUEST_CMD:
                    PropertyListGenerator.getCssProperties(null, message.selector, function (properties) {
                        responseMessage = {
                            cmd: IFrameMessages.GENERATE_CSS_PROPERTIES_IN_IFRAME_RESPONSE_CMD,
                            properties: properties
                        };

                        MessageSandbox.sendServiceMsg(responseMessage, source);
                    });
                    break;

                case IFrameMessages.GENERATE_ATTRIBUTES_IN_IFRAME_REQUEST_CMD:
                    PropertyListGenerator.getAttributes(null, message.selector, function (properties) {
                        responseMessage = {
                            cmd: IFrameMessages.GENERATE_ATTRIBUTES_IN_IFRAME_RESPONSE_CMD,
                            properties: properties
                        };

                        MessageSandbox.sendServiceMsg(responseMessage, source);
                    });
                    break;

                case IFrameMessages.ASSERT_REQUEST_CMD:
                    var args = message.args,
                        operator = message.operator;

                    args[0] = JavaScriptExecutor.eval(args[0]);

                    if (operator === 'eq' || operator === 'notEq')
                        args[1] = JavaScriptExecutor.eval(args[1]);

                    Assertions.assert(operator, args, function (err) {
                        MessageSandbox.sendServiceMsg({
                            cmd: IFrameMessages.ASSERT_RESPONSE_CMD,
                            err: err
                        }, source);
                    });
                    break;

                case IFrameMessages.OBJECT_VIEWER_GET_OBJECT_VIEW_REQUEST_CMD:
                    ObjectViewer.getObjectView(message.stringValue, null, function (objectView) {

                        delete objectView.parsedValue;

                        MessageSandbox.sendServiceMsg({
                            cmd: IFrameMessages.OBJECT_VIEWER_GET_OBJECT_VIEW_RESPONSE_CMD,
                            objectView: objectView,
                            stringValue: message.stringValue
                        }, source);
                    });

                    break;

                case IFrameMessages.OBJECT_VIEWER_GET_OBJECT_PROPERTIES_ROWS_REQUEST_CMD:
                    ObjectViewer.getObjectPropertiesRows(message.stringValue, message.getInheritedProperties, null, function (rows) {
                        MessageSandbox.sendServiceMsg({
                            cmd: IFrameMessages.OBJECT_VIEWER_GET_OBJECT_PROPERTIES_ROWS_RESPONSE_CMD,
                            rows: rows,
                            stringValue: message.stringValue
                        }, source);
                    });

                    break;
            }
        });
    };

    RecorderBase.prototype.loadStepsInfo = function () {
    };

    RecorderBase.prototype.start = function (initIFrameNativeDialogs) {
        var recorder = this;

        this.recording = true;
        this.started = true;

        CursorWidget.init();
        this._initUi();
        this._initRecordingUiEventHandling();
        this._initHammerheadEventHandling();

        Automation.init();
        JavaScriptExecutor.init();

        EventListener.start(function (actionDescriptor) {
            recorder._onActionParsed(actionDescriptor);
        }, this.recordingManagerOptions);

        for (var i = 0; i < this.waitingIframeRecorders.length; i++)
            MessageSandbox.sendServiceMsg({
                cmd: RecorderBase.START_IFRAME_RECORDER_CMD,
                initNativeDialogs: initIFrameNativeDialogs
            }, this.waitingIframeRecorders[i]);
    };

    RecorderBase.prototype._saveDialogHandler = function () {
    };

    RecorderBase.prototype.initNativeDialogsHandling = function () {
        var recorder = this;

        var nativeDialogs = this.nativeDialogs || RecorderUtil.getNativeDialogs();

        window.alert = function (message) {
            EventListener.checkActionsBeforeAdditionNativeDialogHandler();
            recorder._saveDialogHandler('alert');
            return nativeDialogs.alert(message);
        };

        window.confirm = function (message) {
            EventListener.checkActionsBeforeAdditionNativeDialogHandler();
            var ret = nativeDialogs.confirm(message);
            recorder._saveDialogHandler('confirm', ret);
            return ret;
        };

        window.prompt = function (message) {
            EventListener.checkActionsBeforeAdditionNativeDialogHandler();
            var ret = nativeDialogs.prompt(message);
            recorder._saveDialogHandler('prompt', ret);
            return ret;
        };

        Hammerhead.on(Hammerhead.BEFORE_BEFORE_UNLOAD_EVENT, function (e) {
            if (!e.isFakeIEEvent) {
                EventListener.createAllDeferred();
                recorder.beforeUnloadEventWasRaised = true;
            }
        });

        var eventListenerStopped = false;

        Hammerhead.on(Hammerhead.BEFORE_UNLOAD_EVENT, function (e) {
            if (recorder.recording && !Settings.PLAYBACK && e.prevented && !e.isFakeIEEvent)
                recorder._saveDialogHandler('beforeUnload');

            if (!recorder.recording)
                recorder.recording = true;

            if (!e.prevented && !e.isFakeIEEvent) {
                eventListenerStopped = true;
                EventListener.stop();
            }
        });

        Hammerhead.on(Hammerhead.UNLOAD_EVENT, function () {
            if (!eventListenerStopped)
                EventListener.stop();
        });
    };

    RecorderBase.prototype._sendMessageToAllIFrame = function (msg) {
        for (var i = 0; i < this.iFrameListeners.length; i++)
            MessageSandbox.sendServiceMsg(msg, this.iFrameListeners[i]);
    };

    RecorderBase.prototype._startPickingElement = function () {
        this.isPlayback = Settings.PLAYBACK;

        Settings.PLAYBACK = false;
    };

    RecorderBase.prototype._stopPickingElement = function () {
        Settings.PLAYBACK = this.isPlayback;

        this.elementPickCallback = null;

        ElementPicker.stop();
    };

    RecorderBase.prototype._saveStep = function () {
    };

    RecorderBase.prototype._createAllDeferred = function () {
        EventListener.createAllDeferred();
    };

    //Ui
    RecorderBase.prototype._initUi = function () {
    };

    RecorderBase.prototype._initRecordingUiEventHandling = function () {
    };

    // Upload
    RecorderBase.prototype._initHammerheadEventHandling = function () {
    };

    RecorderBase.prototype._onUploadRequested = function () {
    };

    //Recording management
    RecorderBase.prototype._confirmAction = function () {
    };

    RecorderBase.prototype._onActionParsed = function (actionDescriptor, dialogRequired) {
        var recorder = this,
            parsedStepInfo = RecorderUtil.getActionStepInfo(actionDescriptor);

        if (!dialogRequired)
            this._saveStep(parsedStepInfo);
        else {
            this._confirmAction(parsedStepInfo, function (confirmed, stepInfo) {
                if (confirmed)
                    recorder._saveStep(stepInfo);
            });
        }
    };
});
TestCafeClient.define('Recorder.SelectorGenerator.Rules', function (require, exports) {
    var Hammerhead = HammerheadClient.get('Hammerhead'),
        $ = Hammerhead.$,
        Util = Hammerhead.Util,
        SharedConst = require('Shared.Const'),
        jQuerySelectorExtensions = require('Base.jQueryExtensions.Selectors');

    var rules = null,

    //Const
        MAX_TEXT_LENGTH_IN_SELECTOR = 150,
        ASP_AUTOGENERATED_ID_PART_PATTERN = /_ctl\d+|ctl\d+_|^ctl\d+$/g,
        ASP_AUTOGENERATED_ID_PART_PATTERN_WITH_$ = /\$ctl\d+|ctl\d+\$/g,
        ATTRIBUTE_NAMES_FOR_SELECTORS_REGEXPS = [/^alt$/, /^name$/, /^class$/, /^title$/, /^data-\S+/],
        ANY_NUMBER_CONST = '!!!!!anyNumber!!!!!',
        SEPARATOR_CONST = '!!!!!separator!!!!!',

        ELEMENT_WHOSE = 'element whose ',
        ATTRS_SEPARATOR = ', ',
        CLASS_CONTAINS = '{0} contains "{1}"',
        ID_IS = '{0} is "{1}"',
        ATTR_VALUE_IS = '{0} attribute value is "{1}"',
        ATTR_MATCHES_REGEXP = '{0} attribute value matches the regular expression "{1}"',
        ELEMENT_THAT_CONTAIN_TEXT = 'element that contains text "{0}", ignoring child node text',
        TAG_NAME_DESCRIPTION = '{0} element',
        SEARCH_ELEMENT = 'Searches for an {0}.',
        SEARCH_ELEMENT_IN_ANCESTOR = 'Searches through descendants of the {1} for an {0}.',
        SEARCH_INPUT_IN_FORM = 'Searches through descendants of the form {1} for an input {0}.',
        SEARCH_ELEMENT_BY_DOM_PATH = 'Searches through descendants of the <span>body</span> element for an element at a specific location in the DOM hierarchy: {0}.',
        SEARCH_ELEMENT_IN_ANCESTOR_BY_DOM_PATH = 'Searches through descendants of the {1} for an element at a specific location in the DOM hierarchy: {0}.',
        NTH_ELEMENT_IS_RETURNED = 'The {0} matching element is returned.';


    exports.ruleIDs = {
        FOR_HTML: 'html',
        FOR_BODY: 'body',
        BY_ID: 'id',
        BY_TEXT: 'text',
        BY_ANCESTOR_AND_TEXT: 'id-text',
        BY_ATTR: 'attr',
        BY_ANCESTOR_AND_ATTR: 'id-attr',
        BY_TAGS_TREE: 'dom',
        BY_ANCESTOR_WITH_TEXT_AND_TAGS_TREE: 'text-dom',
        BY_ANCESTOR_WITH_ATTR_AND_TAGS_TREE: 'attr-dom',
        BY_INPUT_NAME_AND_FORM: 'form-input',
        USER_INPUT: 'custom'
    };

    //Utils
    var formatString = function (sourceString, args, dontWrapArguments) {
        return sourceString.replace(/{(\d+)}/g, function (match, number) {
            return typeof args[number] === 'undefined' ? match :
                (dontWrapArguments ? args[number] : '<span>' + args[number] + '</span>');
        });
    };

    //Descriptions generating
    var getSelectorParts = function (selector, hasParentSelector) {
        var SELECTOR_START = '$("',
            SELECTOR_END = '")',
            FIND_SUBSTRING = ').find("',
            contextRegEx = /", \$\("[\s|\S]+"\)\.contents\(\)/g;
        if (!selector || selector.indexOf(SELECTOR_START) !== 0 || !(selector.lastIndexOf(SELECTOR_END) === selector.length - SELECTOR_END.length || (!hasParentSelector && new RegExp(contextRegEx)).test(selector)))
            return {};
        if (hasParentSelector) {
            if (selector.indexOf(FIND_SUBSTRING) > 0) {
                var ancestorPart = selector.substring(SELECTOR_START.length, selector.lastIndexOf(FIND_SUBSTRING));
                var elementPart = selector.substring(selector.lastIndexOf(FIND_SUBSTRING) + FIND_SUBSTRING.length);
                if (elementPart.lastIndexOf(SELECTOR_END) !== elementPart.length - SELECTOR_END.length)
                    return {};
                elementPart = elementPart.substring(0, elementPart.lastIndexOf(SELECTOR_END));
                if (new RegExp(contextRegEx).test(ancestorPart)) {
                    return {
                        elementSelector: elementPart,
                        ancestorSelector: ancestorPart.substring(0, ancestorPart.search(new RegExp(contextRegEx))),
                        contextSelector: ancestorPart.substring(ancestorPart.search(new RegExp(contextRegEx)))
                    };
                }
                else {
                    return {
                        elementSelector: elementPart,
                        ancestorSelector: ancestorPart.substring(0, ancestorPart.lastIndexOf('"'))

                    };
                }
            }
            else
                return {};
        }
        else {
            if (new RegExp(contextRegEx).test(selector)) {
                return {
                    elementSelector: selector.substring(SELECTOR_START.length, selector.search(new RegExp(contextRegEx))),
                    contextSelector: selector.substring(selector.search(new RegExp(contextRegEx)))
                };
            }
            else {
                return {
                    elementSelector: selector.substring(SELECTOR_START.length, selector.lastIndexOf(SELECTOR_END))
                };
            }
        }
    };

    var getAttrSelectorDescription = function (selector) {
        if (!selector)
            return '';

        var attrRegExpStart = ':' + jQuerySelectorExtensions.ATTR_REGEXP_METHOD_NAME + '(',
            attrRegExpSeparator = jQuerySelectorExtensions.REGEXP_START_SUBSTR,
            attrRegExpEnd = jQuerySelectorExtensions.REGEXP_END_SUBSTR + ')',
            attrStart = '[',
            attrSeparator = '=\'',
            attrEnd = '\']',
            classStart = '.',
            idStart = '#',
            expression = null,
            attrName = null,

            description = '',
            rest = selector,

            replaceDoubleSlashWithSlash = function (text) {
                return text.replace(/\\\\/g, '\\');
            };

        while (rest) {
            description += description ? ATTRS_SEPARATOR : ELEMENT_WHOSE;
            if (rest.indexOf(idStart) === 0) {
                var id = rest.substring(idStart.length);
                description += formatString(ID_IS, ['id', id]);
                rest = '';
            }
            else if (rest.indexOf(classStart) === 0) {
                var classes = '';
                var end = rest.indexOf(attrRegExpStart) > 0 ? rest.indexOf(attrStart) > 0 ? Math.min(rest.indexOf(attrRegExpStart), rest.indexOf(attrStart)) : rest.indexOf(attrRegExpStart) : rest.indexOf(attrStart);
                if (end > 0) {
                    classes = rest.substring(0, end);
                    rest = rest.substring(end);
                }
                else {
                    classes = rest;
                    rest = '';
                }
                classes = classes.substring(classStart.length).replace(/\./g, ' ');
                if (!classes)
                    return '';
                description += formatString(CLASS_CONTAINS, ['class', classes]);
            }
            else if (rest.indexOf(attrRegExpStart) === 0) {
                if (rest.indexOf(attrRegExpEnd) < 0)
                    return '';
                expression = rest.substring(attrRegExpStart.length, rest.indexOf(attrRegExpEnd));
                if (expression.indexOf(attrRegExpSeparator) < 0)
                    return '';
                rest = rest.substring(rest.indexOf(attrRegExpEnd) + attrRegExpEnd.length);
                attrName = expression.substring(0, expression.indexOf(attrRegExpSeparator));
                var regExp = expression.substring(expression.indexOf(attrRegExpSeparator) + attrRegExpSeparator.length);
                regExp = replaceDoubleSlashWithSlash(regExp);
                description += formatString(ATTR_MATCHES_REGEXP, [attrName, regExp]);
            }
            else if (rest.indexOf(attrStart) === 0) {
                //TODO: handle case when attr value contains "']" substring
                if (rest.indexOf(attrEnd) < 0)
                    return '';
                expression = rest.substring(attrStart.length, rest.indexOf(attrEnd));
                if (expression.indexOf(attrSeparator) < 0)
                    return '';
                rest = rest.substring(rest.indexOf(attrEnd) + attrEnd.length);
                attrName = expression.substring(0, expression.indexOf(attrSeparator));
                var attrValue = expression.substring(expression.indexOf(attrSeparator) + attrSeparator.length);
                attrValue = replaceDoubleSlashWithSlash(attrValue);
                if (attrName === 'id')
                    description += formatString(ID_IS, [attrName, attrValue]);
                else
                    description += formatString(ATTR_VALUE_IS, [attrName, attrValue]);
            }
            else return '';
        }
        return description;
    };

    var getTextSelectorDescription = function (selector) {
        var containsExcludeChildrenStart = ':' + jQuerySelectorExtensions.CONTAINS_OWN_TEXT_METHOD_NAME + '(',
            containsExcludeChildrenEnd = ')';
        if (selector.indexOf(containsExcludeChildrenStart) === 0 && selector.indexOf(containsExcludeChildrenEnd) > 0)
            return formatString(ELEMENT_THAT_CONTAIN_TEXT, [selector.substring(containsExcludeChildrenStart.length, selector.lastIndexOf(containsExcludeChildrenEnd))]);
        else return '';
    };

    var getNumberAsWordFromIndex = function (index) {
        var number = index + 1,
            ending = 'th',
            lastDigit = number % 10,
            prevDigit = (number % 100 - lastDigit) / 10;
        if (prevDigit !== 1) {
            if (lastDigit === 1)
                ending = 'st';
            else if (lastDigit === 2)
                ending = 'nd';
            else if (lastDigit === 3)
                ending = 'rd';
        }
        return number.toString() + ending;
    };

    var getDomPathSelectorDescription = function (selector) {
        var description = '',
            rest = selector,
            separator = ' > ',
            beforeNumber = ':nth(',
            afterNumber = ')';
        while (rest) {
            if (rest.indexOf(separator) < 0)
                return '';
            rest = rest.substring(rest.indexOf(separator) + separator.length);
            var indexBeforeNumber = rest.indexOf(beforeNumber);
            var indexAfterNumber = rest.indexOf(afterNumber);
            if (indexBeforeNumber < 0 || indexAfterNumber < 0 || indexAfterNumber < indexBeforeNumber)
                return '';
            var tagName = rest.substring(0, indexBeforeNumber);
            var elementIndex = rest.substring(indexBeforeNumber + beforeNumber.length, indexAfterNumber);
            if (!tagName || !elementIndex)
                return '';
            rest = rest.substring(indexAfterNumber + afterNumber.length);
            if (description)
                description += ', then ';
            description += formatString('{0}', [getNumberAsWordFromIndex(parseInt(elementIndex)) + ' ' + tagName]);
        }
        return description;
    };

    var getTagNameSelectorDescription = function (selector) {
        if (selector)
            return formatString(TAG_NAME_DESCRIPTION, [selector]);
    };

    var buildSelectorDescription = function (selector, baseString, elementDescriptionGetter, ancestorDescriptionGetter) {
        var selectorParts = null,
            elementDescription = null;
        if (ancestorDescriptionGetter) {
            selectorParts = getSelectorParts(selector, true);
            if (selectorParts.elementSelector && selectorParts.ancestorSelector) {
                var ancestorDescription = ancestorDescriptionGetter(selectorParts.ancestorSelector);

                elementDescription = elementDescriptionGetter(selectorParts.elementSelector);

                if (ancestorDescription && elementDescription)
                    return formatString(baseString, [elementDescription, ancestorDescription], true);
            }
        }
        else {
            selectorParts = getSelectorParts(selector, false);
            if (selectorParts.elementSelector) {
                elementDescription = elementDescriptionGetter(selectorParts.elementSelector);

                if (elementDescription)
                    return formatString(baseString, [elementDescription], true);
            }
        }
        return selector;
    };

    //Selectors generating
    var getAttrRegExpSelector = function (attrName, regExp, needForEndOfStringSymbol) {
        return  [':', jQuerySelectorExtensions.ATTR_REGEXP_METHOD_NAME, '(', attrName, jQuerySelectorExtensions.REGEXP_START_SUBSTR, '^', regExp, needForEndOfStringSymbol ? '$' : '', jQuerySelectorExtensions.REGEXP_END_SUBSTR, ')'].join('');
    };

    var getAncestorWithId = function ($element) {
        return $element.parent().closest('[id]');
    };

    var getTextSelector = function ($element) {
        return [
            ':', jQuerySelectorExtensions.CONTAINS_OWN_TEXT_METHOD_NAME, '(', jQuerySelectorExtensions.getOwnTextForSelector($element[0]).substr(0, MAX_TEXT_LENGTH_IN_SELECTOR), ')'
        ].join('');
    };

    var getAttributeNamesForSelector = function ($element) {
        var attributeNames = [];

        if ($element[0][SharedConst.OLD_ATTR_VALUES]) {
            for (var attribute in $element[0][SharedConst.OLD_ATTR_VALUES])
                if ($element[0][SharedConst.OLD_ATTR_VALUES].hasOwnProperty(attribute))
                    if (isAttributeAcceptableForSelector($element, attribute, $element[0][SharedConst.OLD_ATTR_VALUES][attribute]))
                        attributeNames.push(attribute);
        }
        else
            $.each($element[0].attributes, function (index, attribute) {
                if (isAttributeAcceptableForSelector($element, attribute.nodeName, attribute.nodeValue))
                    attributeNames.push(attribute.nodeName);
            });

        return attributeNames;
    };

    var isAttributeAcceptableForSelector = function ($element, attributeName, attributeValue) {
        //NOTE: we don't take into account attributes added by TestCafe
        var storedAttrRegExp = new RegExp(Hammerhead.DOM_SANDBOX_STORED_ATTR_POSTFIX + '$', 'g');

        if (attributeValue)
            for (var i = 0; i < ATTRIBUTE_NAMES_FOR_SELECTORS_REGEXPS.length; i++)
                if (ATTRIBUTE_NAMES_FOR_SELECTORS_REGEXPS[i].test(attributeName) && !storedAttrRegExp.test(attributeValue) && !storedAttrRegExp.test(attributeName))
                    return true;
    };

    var getAttributesSelector = function ($element, attributeNames) {
        var getAttributeValue = function ($element, attributeName) {
                if ($element[0][SharedConst.OLD_ATTR_VALUES])
                    return $element[0][SharedConst.OLD_ATTR_VALUES][attributeName];
                else
                    return $element.attr(attributeName);
            },
            selector = '';
        $.each(attributeNames, function (index, attributeName) {
            var attributeValue = getAttributeValue($element, attributeName);
            var valueWasCut = false;
            var valueWasChanged = false;
            if (attributeValue.replace(/\s+/g, ' ').length > MAX_TEXT_LENGTH_IN_SELECTOR) {
                attributeValue = attributeValue.substr(0, MAX_TEXT_LENGTH_IN_SELECTOR);
                valueWasCut = true;
                valueWasChanged = true;
            }

            if (new RegExp(ASP_AUTOGENERATED_ID_PART_PATTERN).test(attributeValue) || new RegExp(ASP_AUTOGENERATED_ID_PART_PATTERN_WITH_$).test(attributeValue)) {
                var matchingRegExp = new RegExp(ASP_AUTOGENERATED_ID_PART_PATTERN).test(attributeValue) ? ASP_AUTOGENERATED_ID_PART_PATTERN : ASP_AUTOGENERATED_ID_PART_PATTERN_WITH_$;
                attributeValue = attributeValue.replace(new RegExp(matchingRegExp), function (substr) {
                    valueWasChanged = true;
                    return substr.replace(/\d+/, ANY_NUMBER_CONST);
                });
            }
            attributeValue = attributeValue.replace(/\s+/g, function (substr) {
                if (substr === ' ')
                    return substr;
                else {
                    valueWasChanged = true;
                    return SEPARATOR_CONST;
                }
            });

            if (!valueWasChanged) {
                attributeValue = replaceAttrSymbolsWithEscapeSequences(attributeValue);
                if (attributeName === 'class') {
                    selector += '.' + attributeValue.replace(/ +/g, '.');
                }
                else selector += [
                    '[', attributeName, '=\'', attributeValue, '\']'
                ].join('');
            }
            else {
                attributeValue = replaceRegExpSymbolsWithEscapeSequences(attributeValue);
                attributeValue = attributeValue.replace(new RegExp(ANY_NUMBER_CONST, 'g'), '\\\\d+');
                attributeValue = attributeValue.replace(new RegExp(SEPARATOR_CONST, 'g'), '\\\\s+');
                selector += getAttrRegExpSelector(attributeName, attributeValue, !valueWasCut);
            }
        });

        return selector;
    };

    var replaceRegExpSymbolsWithEscapeSequences = function (text) {
        return text.replace(/'|"|\(|\)|\||\-|\*|\?|\+|\\|\^|\$|\[|\]/g, function (substr) {
            if (substr === '\\')
                return '\\\\\\\\';
            else if (substr === '(' || substr === ')')
                return '\\\\S';
            else if (substr === '"' || substr === '\'')
                return '\\' + substr;
            else return "\\\\" + substr;
        });
    };

    var replaceAttrSymbolsWithEscapeSequences = function (text) {
        return text.replace(/'|"|\\/g, function (substr) {
            if (substr === '\\')
                return '\\\\\\\\';
            else if (substr === '\'')
                return '\\\\' + substr;
            else if (substr === '"')
                return '\\' + substr;
            else return substr;
        });
    };

    var replaceIDSymbolsWithEscapeSequences = function (text) {
        return text.replace(/\!|"|#|\$|%|&|\'|\(|\||\)|\*|\+|,|\.|\/|:|;|<|=|>|\?|@|\[|\\|\]|\^|`|{|\||}|~/g, function (substr) {
            if (substr === '\\')
                return '\\\\\\\\';
            else if (substr === '"')
                return '\\\\\\' + substr;
            else
                return "\\\\" + substr;
        });
    };

    var getTagsTreeSelector = function ($element, $lastAncestor) {
        var getNthSelectorString = function ($el) {
            if ($el.parent().length)
                return ' > ' + $el[0].tagName.toLowerCase() + ':nth(' + $el.parent().find('>' + $el[0].tagName).index($el) + ')';
        };
        var tagsTreeSelector = getNthSelectorString($element);
        $element.parentsUntil($lastAncestor).each(function () {
            tagsTreeSelector = getNthSelectorString($(this)) + tagsTreeSelector;
        });
        return tagsTreeSelector;
    };

    var wasElementRemoved = function ($element) {
        return !$element.closest('html').length;
    };

    var wereElementAttributesChanged = function ($element) {
        if ($element[0][SharedConst.OLD_ATTR_VALUES]) {
            for (var attribute in $element[0][SharedConst.OLD_ATTR_VALUES])
                if ($element[0][SharedConst.OLD_ATTR_VALUES].hasOwnProperty(attribute))
                    if (isAttributeAcceptableForSelector($element, attribute, $element[0][SharedConst.OLD_ATTR_VALUES][attribute]))
                        if ($element[0][SharedConst.OLD_ATTR_VALUES][attribute] !== $element.attr(attribute))
                            return true;
        }
        return false;
    };

    //Generating rules

    var SelectorGeneratingRule = function () {
    };

    SelectorGeneratingRule.prototype.wasElementChanged = function ($el) {
        return wasElementRemoved($el);
    };

    SelectorGeneratingRule.prototype.getDescription = function (selector) {
        return selector;
    };

    var selectorByIdRule = $.extend(new SelectorGeneratingRule(), {
            check: function ($el) {
                return !!$el.attr('id');
            },
            generate: function ($el) {
                var id = $el.attr('id');
                //new RexExp is created because firefox doesn't reset lastIndex of RegExp object
                if (new RegExp(ASP_AUTOGENERATED_ID_PART_PATTERN).test(id)) {
                    var idRegExp = replaceRegExpSymbolsWithEscapeSequences(id);
                    idRegExp = idRegExp.replace(new RegExp(ASP_AUTOGENERATED_ID_PART_PATTERN), function (substr) {
                        return substr.replace(/\d+/, "\\\\d+");
                    });

                    return {
                        selector: getAttrRegExpSelector('id', idRegExp, true),
                        ancestorExpression: null
                    };
                }
                
                return {
                    selector: '#' + replaceIDSymbolsWithEscapeSequences(id),
                    ancestorExpression: null
                };
            },
            getDescription: function (selector) {
                return buildSelectorDescription(selector, SEARCH_ELEMENT, getAttrSelectorDescription);
            },
            id: exports.ruleIDs.BY_ID
        }
    );

    var selectorForHtmlRule = $.extend(new SelectorGeneratingRule(), {
            check: function ($el) {
                return $el.is('html');
            },
            generate: function ($el) {
                return {
                    selector: $el[0].tagName.toLowerCase(),
                    ancestorExpression: null
                };
            },
            getDescription: function (selector) {
                return buildSelectorDescription(selector, SEARCH_ELEMENT, getTagNameSelectorDescription);
            },
            id: exports.ruleIDs.FOR_HTML
        }
    );

    var selectorForBodyRule = $.extend(new SelectorGeneratingRule(), {
            check: function ($el) {
                return $el.is('body');
            },
            generate: function ($el) {
                return {
                    selector: $el[0].tagName.toLowerCase(),
                    ancestorExpression: null
                };
            },
            getDescription: function (selector) {
                return buildSelectorDescription(selector, SEARCH_ELEMENT, getTagNameSelectorDescription);
            },
            id: exports.ruleIDs.FOR_BODY
        }
    );

    var selectorByTextRule = $.extend(new SelectorGeneratingRule(), {
            check: function ($el) {
                return !!jQuerySelectorExtensions.getOwnTextForSelector($el[0]);
            },
            generate: function ($el) {
                return {
                    selector: getTextSelector($el),
                    ancestorExpression: null
                };
            },
            getDescription: function (selector) {
                return buildSelectorDescription(selector, SEARCH_ELEMENT, getTextSelectorDescription);
            },
            id: exports.ruleIDs.BY_TEXT
        }
    );

    var selectorByAncestorAndTextRule = $.extend(new SelectorGeneratingRule(), {
            check: function ($el) {
                return jQuerySelectorExtensions.getOwnTextForSelector($el[0]) && getAncestorWithId($el).length;
            },
            generate: function ($el) {
                return {
                    selector: getTextSelector($el),
                    ancestor: {
                        rule: selectorByIdRule,
                        $el: getAncestorWithId($el)
                    }
                };
            },
            getDescription: function (selector) {
                return buildSelectorDescription(selector, SEARCH_ELEMENT_IN_ANCESTOR, getTextSelectorDescription, getAttrSelectorDescription);
            },
            id: exports.ruleIDs.BY_ANCESTOR_AND_TEXT
        }
    );

    var selectorByAttributesRule = $.extend(new SelectorGeneratingRule(), {
            check: function ($el) {
                return !!getAttributeNamesForSelector($el).length;
            },
            generate: function ($el) {
                var attributeNames = getAttributeNamesForSelector($el);

                return {
                    selector: getAttributesSelector($el, attributeNames),
                    ancestorExpression: null
                };
            },
            wasElementChanged: function ($el) {
                return wasElementRemoved($el) || wereElementAttributesChanged($el);
            },
            getDescription: function (selector) {
                return buildSelectorDescription(selector, SEARCH_ELEMENT, getAttrSelectorDescription);
            },
            id: exports.ruleIDs.BY_ATTR
        }
    );

    var selectorByAncestorAndAttributesRule = $.extend(new SelectorGeneratingRule(), {
            check: function ($el) {
                return getAttributeNamesForSelector($el).length && getAncestorWithId($el).length;
            },
            generate: function ($el) {
                var attributeNames = getAttributeNamesForSelector($el);

                return {
                    selector: getAttributesSelector($el, attributeNames),
                    ancestor: {
                        rule: selectorByIdRule,
                        $el: getAncestorWithId($el)
                    }
                };
            },
            wasElementChanged: function ($el) {
                return wasElementRemoved($el) && wereElementAttributesChanged($el);
            },
            getDescription: function (selector) {
                return buildSelectorDescription(selector, SEARCH_ELEMENT_IN_ANCESTOR, getAttrSelectorDescription, getAttrSelectorDescription);
            },
            id: exports.ruleIDs.BY_ANCESTOR_AND_ATTR
        }
    );

    var selectorByTagsTreeRule = $.extend(new SelectorGeneratingRule(), {
            check: function () {
                return true;
            },
            generate: function ($el) {
                return {
                    selector: 'body' + getTagsTreeSelector($el, $('body', Util.findDocument($el[0]))),
                    ancestorExpression: null
                };
            },
            getDescription: function (selector) {
                return buildSelectorDescription(selector, SEARCH_ELEMENT_BY_DOM_PATH, getDomPathSelectorDescription);
            },
            id: exports.ruleIDs.BY_TAGS_TREE
        }
    );

    var selectorByAncestorWithTextAndTagsTreeRule = $.extend(new SelectorGeneratingRule(), {
            check: function ($el) {
                if (/html|body/.test($el[0].tagName.toLowerCase()))
                    return false;
                var $parents = $el.parentsUntil('body');
                for (var parentIndex = 0; parentIndex < $parents.length; parentIndex++)
                    if (selectorByTextRule.check($parents.eq(parentIndex)))
                        return true;
                return false;
            },
            generate: function ($el) {
                if (/html|body/.test($el[0].tagName.toLowerCase()))
                    return false;
                var $parents = $el.parentsUntil('body');
                for (var i = 0; i < $parents.length; i++) {
                    if (selectorByTextRule.check($parents.eq(i))) {
                        return {
                            selector: getTagsTreeSelector($el, $parents.eq(i)),
                            ancestor: {
                                rule: selectorByTextRule,
                                $el: $parents.eq(i)
                            }
                        };
                    }
                }
            },
            getDescription: function (selector) {
                return buildSelectorDescription(selector, SEARCH_ELEMENT_IN_ANCESTOR_BY_DOM_PATH, getDomPathSelectorDescription, getTextSelectorDescription);
            },
            id: exports.ruleIDs.BY_ANCESTOR_WITH_TEXT_AND_TAGS_TREE
        }
    );

    var selectorByAncestorWithAttrAndTagsTreeRule = $.extend(new SelectorGeneratingRule(), {
            check: function ($el) {
                if (/html|body/.test($el[0].tagName.toLowerCase()))
                    return false;
                var $parents = $el.parentsUntil('body');
                var acceptableRules = [selectorByIdRule, selectorByAttributesRule];
                for (var parentIndex = 0; parentIndex < $parents.length; parentIndex++)
                    for (var ruleIndex = 0; ruleIndex < acceptableRules.length; ruleIndex++)
                        if (acceptableRules[ruleIndex].check($parents.eq(parentIndex)))
                            return true;
                return false;
            },
            generate: function ($el) {
                if (/html|body/.test($el[0].tagName.toLowerCase()))
                    return false;
                var $parents = $el.parentsUntil('body');
                var acceptableRules = [selectorByIdRule, selectorByAttributesRule];

                for (var i = 0; i < $parents.length; i++) {
                    var rule = null,
                        $parent = $parents.eq(i);

                    for (var j = 0; j < acceptableRules.length; j++) {
                        if (acceptableRules[j].check($parent))
                            rule = acceptableRules[j];
                    }

                    if (rule) {
                        return {
                            selector: getTagsTreeSelector($el, $parents.eq(i)),
                            ancestor: {
                                rule: rule,
                                $el: $parent
                            }
                        };
                    }
                }
            },
            getDescription: function (selector) {
                return buildSelectorDescription(selector, SEARCH_ELEMENT_IN_ANCESTOR_BY_DOM_PATH, getDomPathSelectorDescription, getAttrSelectorDescription);
            },
            id: exports.ruleIDs.BY_ANCESTOR_WITH_ATTR_AND_TAGS_TREE
        }
    );

    var selectorForInputInFormRule = $.extend(new SelectorGeneratingRule(), {
            check: function ($el) {
                if ($el.is('input') && $el.attr('name')) {
                    var $form = $el.closest('form');
                    return $form.length && (selectorByIdRule.check($form) || selectorByAttributesRule.check($form));
                }
                return false;
            },
            generate: function ($el) {
                var $form = $el.closest('form'),
                    rule = null,
                    acceptableRules = [selectorByIdRule, selectorByAttributesRule];

                if ($form.length) {
                    for (var j = 0; j < acceptableRules.length; j++) {
                        if (acceptableRules[j].check($form))
                            rule = acceptableRules[j];
                    }

                    if (rule) {
                        return {
                            selector: getAttributesSelector($el, ['name']),
                            ancestor: {
                                rule: rule,
                                $el: $form
                            }
                        };
                    }
                }
            },
            getDescription: function (selector) {
                return buildSelectorDescription(selector, SEARCH_INPUT_IN_FORM, getAttrSelectorDescription, getAttrSelectorDescription);
            },
            id: exports.ruleIDs.BY_INPUT_NAME_AND_FORM
        }
    );

    exports.makeSelectorUnique = function (selectorObject, $element, $selectorResult) {
        var elementIndex = $selectorResult.index($element);
        if ($selectorResult.length === 1 && elementIndex >= 0)
            return;
        else if ($selectorResult.length === 0 && elementIndex === -1)
            return;
        if (elementIndex === -1) {
            elementIndex = 0;
        }
        //TODO: do this for not-jQuery selectors if we'll add custom rules feature
        selectorObject.selector = selectorObject.selector + '.eq(' + elementIndex + ')';
        selectorObject.description = selectorObject.description + ' ' + formatString(NTH_ELEMENT_IS_RETURNED, [getNumberAsWordFromIndex(elementIndex)]);
    };

    exports.init = function () {
        rules = [
            selectorForHtmlRule,
            selectorForBodyRule,
            selectorForInputInFormRule,
            selectorByIdRule,
            selectorByAncestorAndTextRule,
            selectorByTextRule,
            selectorByAncestorAndAttributesRule,
            selectorByAttributesRule,
            selectorByAncestorWithTextAndTagsTreeRule,
            selectorByAncestorWithAttrAndTagsTreeRule,
            selectorByTagsTreeRule
        ];
    };

    exports.getRules = function () {
        if (!rules)
            exports.init();
        return rules;
    };
});
TestCafeClient.define('Recorder.SelectorGenerator', function (require, exports) {
        var Hammerhead = HammerheadClient.get('Hammerhead'),
            $ = Hammerhead.$,
            Util = Hammerhead.Util,
            GeneratorRules = require('Recorder.SelectorGenerator.Rules'),
            JavascriptExecutor = require('Base.JavascriptExecutor');

        var generatingRules = [],
            rulePriorities = {},
            initialized = false,

        //selector by tags tree becomes more of a priority when number of elements found by other selectors more than:
            ANCESTOR_AND_TAGS_TREE_RULE_VALIDITY_BOUND = 10,
            TAGS_TREE_RULE_VALIDITY_BOUND = 20;

        exports.GLOBAL_SELECTOR_GENERATOR = 'tc-gsg-d1417385';

        var setRulePriority = function (ruleID, priority) {
            if (priority > 0) {
                for (var i = 0; i < generatingRules.length; i++)
                    if (rulePriorities[generatingRules[i].id] === priority && generatingRules[i] !== this) {
                        setRulePriority(generatingRules[i].id, priority + 1);
                        break;
                    }
                rulePriorities[ruleID] = priority;
            }
            else
                rulePriorities[ruleID] = 0;
        };

        var getRulePriority = function (ruleID) {
            return rulePriorities[ruleID] || 0;
        };

        exports.getRulePriorities = function () {
            return rulePriorities;
        };

        //priority is incremented by this value for each element found by selector except the desired
        var getPriorityShift = function () {
            return Math.pow(10, generatingRules.length.toString().length);
        };

        var initPriorities = function () {
            rulePriorities = {};
            setRulePriority(GeneratorRules.ruleIDs.FOR_HTML, 1);
            setRulePriority(GeneratorRules.ruleIDs.FOR_BODY, 2);
            setRulePriority(GeneratorRules.ruleIDs.BY_ID, 3);
            setRulePriority(GeneratorRules.ruleIDs.BY_INPUT_NAME_AND_FORM, 4);
            setRulePriority(GeneratorRules.ruleIDs.BY_TEXT, 5);
            setRulePriority(GeneratorRules.ruleIDs.BY_ANCESTOR_AND_TEXT, 6);
            setRulePriority(GeneratorRules.ruleIDs.BY_ATTR, 7);
            setRulePriority(GeneratorRules.ruleIDs.BY_ANCESTOR_AND_ATTR, 8);

            setRulePriority(GeneratorRules.ruleIDs.BY_ANCESTOR_WITH_ATTR_AND_TAGS_TREE, getPriorityShift() * ANCESTOR_AND_TAGS_TREE_RULE_VALIDITY_BOUND);
            setRulePriority(GeneratorRules.ruleIDs.BY_ANCESTOR_WITH_TEXT_AND_TAGS_TREE, getRulePriority(GeneratorRules.ruleIDs.BY_ANCESTOR_WITH_ATTR_AND_TAGS_TREE) + 1);
            setRulePriority(GeneratorRules.ruleIDs.BY_TAGS_TREE, getPriorityShift() * TAGS_TREE_RULE_VALIDITY_BOUND);
        };

        var getSelectorPriority = function ($el, $selectorResult, rule) {
            var wasElementChanged = rule.wasElementChanged($el);

            if ($selectorResult.length === 1 && !wasElementChanged && $selectorResult[0] === $el[0])
                return getRulePriority(rule.id);
            else if ($selectorResult.length === 0 && wasElementChanged)
                return getRulePriority(rule.id);
            else if ($selectorResult.length && (wasElementChanged || $selectorResult.index($el) !== -1)) {
                return getRulePriority(rule.id) + getPriorityShift() * ($selectorResult.length + (wasElementChanged ? 1 : 0));
            }
            else return 0;
        };

        var sortSelectorsByPriority = function (selectorObjects, selectorPriorities) {
            selectorObjects.sort(function (obj1, obj2) {
                if (selectorPriorities[obj1.selector] < selectorPriorities[obj2.selector])
                    return -1;
                else if (selectorPriorities[obj1.selector] > selectorPriorities[obj2.selector])
                    return 1;
                else return 0;
            });
        };

        var getContextString = function ($el) {
            if (Util.isElementInIframe($el[0])) {
                var iframe = Util.getIFrameByElement($el[0]);
                if (iframe) {
                    var iFrameSelectors = exports.generate($(iframe));

                    if (iFrameSelectors.length)
                        return iFrameSelectors[0].selector + '.contents()';
                }
            }
            return '';
        };

        var buildJQueryExpression = function ($el, elementSelector, ancestorExpression) {
            if (ancestorExpression)
                return [
                    ancestorExpression, '.find("', elementSelector, '")'
                ].join('');
            else {
                var contextString = getContextString($el);
                if (contextString)
                    return [
                        '$("', elementSelector, '", ', contextString, ')'
                    ].join('');
                else return [
                    '$("', elementSelector, '")'
                ].join('');
            }
        };

        var generateJQueryExpressionByRule = function ($el, generatingRule) {
            var generatingRulesResult = generatingRule.generate($el),
                ancestorExpression = '';

            if (typeof generatingRulesResult === 'string')
                return generatingRulesResult;

            if (generatingRulesResult.ancestor)
                ancestorExpression = generateJQueryExpressionByRule(generatingRulesResult.ancestor.$el, generatingRulesResult.ancestor.rule);

            return buildJQueryExpression($el, generatingRulesResult.selector, ancestorExpression);
        };

        var init = function () {
            generatingRules = GeneratorRules.getRules();
            initPriorities();
            initialized = true;
        };

        exports.generate = function ($element) {
            if (!initialized)
                init();

            var selectorObjects = [];
            var selectorPriorities = {};

            if (!$element.length)
                return selectorObjects;

            for (var i = 0; i < generatingRules.length; i++) {
                if (generatingRules[i].check($element)) {
                    var selector = generateJQueryExpressionByRule($element, generatingRules[i]),
                        $selectorResult = JavascriptExecutor.parseSelectorSync(selector).$elements;

                    if (!selector || !$selectorResult)
                        continue;
                    var priority = getSelectorPriority($element, $selectorResult, generatingRules[i]);
                    var description = generatingRules[i].getDescription(selector);
                    var selectorObject = {id: generatingRules[i].id, selector: selector, description: description};

                    GeneratorRules.makeSelectorUnique(selectorObject, $element, $selectorResult);

                    if (priority > 0) {
                        if (!selectorPriorities[selectorObject.selector]) {
                            selectorObjects.push(selectorObject);
                            selectorPriorities[selectorObject.selector] = priority;
                        }
                        else if (priority < selectorPriorities[selectorObject.selector]) {
                            selectorPriorities[selectorObject.selector] = priority;
                            for (var j = 0; j < selectorObjects.length; j++)
                                selectorObjects[j] = selectorObject;
                        }
                    }
                }
            }

            sortSelectorsByPriority(selectorObjects, selectorPriorities);

            return selectorObjects;
        };

        exports.generateIFrameSelectorsByElement = function (element) {
            var iFrame = Util.getIFrameByElement(element);

            return iFrame ? window.top[exports.GLOBAL_SELECTOR_GENERATOR]($(iFrame)) : null;
        };

        if (window.self === window.top)
            window[exports.GLOBAL_SELECTOR_GENERATOR] = exports.generate;
    }
);
TestCafeClient.define('Recorder.StepNameGenerator', function (require, exports) {
        var Hammerhead = HammerheadClient.get('Hammerhead'),
            $ = Hammerhead.$;

        var ELEMENTS_NAME_DICTIONARY = {
            'a': 'link',
            'img': 'image',
            'li': 'list item',
            'ol': 'ordered list',
            'p': 'paragraph',
            'q': 'quotation',
            'td': 'table cell',
            'th': 'header cell',
            'tr': 'table row',
            'ul': 'unordered list',
            'textarea': 'text area'
        };

        var ELEMENTS_WITH_ANGLE_BRACKETS = ['b', 'bdi', 'bdo', 'big', 'blockquote', 'br', 'center', 'cite', 'code', 'col',
            'colgroup', 'del', 'dfn', 'em', 'font', 'header', 'hgroup', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i',
            'ins', 'kbd', 'mark', 'optgroup', 'pre', 'ruby', 'rp', 'rt', 's', 'samp', 'small', 'strike', 'strong', 'sub',
            'sup', 'thead', 'tfoot', 'tbody', 'tt', 'u', 'var', 'wbr', 'svg', 'text', 'path', 'textpath', 'tspan', 'tref',
            'dd', 'dir', 'dl', 'dt', 'nav'];


        function getElementName(element) {
            var tagName = (element && element.tagName) ? element.tagName.toLowerCase() : '',
                elementType = (element && element.type) ? element.type.toLowerCase() : '';

            if (ELEMENTS_NAME_DICTIONARY[tagName])
                return ELEMENTS_NAME_DICTIONARY[tagName];

            if ($.inArray(tagName, ELEMENTS_WITH_ANGLE_BRACKETS) !== -1)
                return '<' + tagName + '>';

            if (tagName === 'button' && elementType && elementType !== 'button')
                return elementType + ' button';

            if (tagName === 'command' && elementType && elementType !== 'command')
                return elementType + ' command';

            if (tagName === 'input') {
                if (!elementType || (elementType && elementType === 'text'))
                    return tagName;

                if (elementType && /hidden|password/.test(elementType))
                    return elementType + ' input';

                if (elementType && /file|image|reset|submit|radio/.test(elementType))
                    return elementType + ' button';

                if (elementType && /checkbox/.test(elementType))
                    return'check box';

                if (elementType && /button/.test(elementType))
                    return 'button';
            }

            return tagName;
        }

        //API
        exports.generateStepName = function (actionDescriptor) {
            var stepName = actionDescriptor.type[0].toUpperCase() + actionDescriptor.type.substring(1) + ' ',
                element = actionDescriptor.element,
                elements = actionDescriptor.elements,
                tagName = (element && element.tagName) ? element.tagName.toLowerCase() : '',
                elementType = (element && element.type) ? element.type.toLowerCase() : '',

                currentName = '',
                currentDescriptor = null;

            var cropText = function (text) {
                var wordBounds = [],
                    wordBoundRegExp = /(\s|$)/g,
                    maxLength = 20,
                    result = '';

                text = $.trim(text).replace(/(\n)|(\r\n)/g, '').replace(/\s+/g, ' ');

                if (text.length <= maxLength)
                    return text;

                while (wordBoundRegExp.exec(text) && wordBounds.length < 3)
                    wordBounds.push(wordBoundRegExp.lastIndex);

                $.each(wordBounds.reverse(), function (index, value) {
                    if (value < maxLength) {
                        result = text.substring(0, value - 1) + '...';
                        return false;
                    }
                });
                return result || text.substring(0, maxLength - 1) + '...';
            };

            var generateElementDescriptionByAttributes = function () {
                var elementAttr = null,
                    description = '',
                    text = '';

                $.each(arguments[0], function (index, value) {
                    if (value === 'text') {
                        //NOTE: we should take own element's text only (not children's text)
                        for (var i = 0; i < element.childNodes.length; ++i)
                            if (element.childNodes[i].nodeType === 3)
                                text += element.childNodes[i].textContent ? element.childNodes[i].textContent : element.innerText;
                        elementAttr = $.trim(text);
                    }
                    else
                        elementAttr = element[value];

                    if (elementAttr) {
                        if (value === 'text')
                            description = ' "' + cropText(elementAttr) + '"';
                        else
                            description = ' "' + cropText(elementAttr) + '"';
                        return false;
                    }
                });

                return description;
            };

            if (actionDescriptor.type === 'press') {
                if (/\+/.test(actionDescriptor.apiArguments.keysCommand))
                    stepName += 'key combination ' + actionDescriptor.apiArguments.keysCommand.toUpperCase();
                else
                    stepName += 'key ' + actionDescriptor.apiArguments.keysCommand.toUpperCase();
                return stepName;
            }
            else if (actionDescriptor.type === 'wait') {
                stepName += actionDescriptor.apiArguments.ms + ' milliseconds';
                return stepName;
            }
            else if (actionDescriptor.type === 'screenshot'){
                return 'Take a ' + actionDescriptor.type;
            }
            else if (actionDescriptor.type === 'type')
                stepName += 'in ';
            else if (actionDescriptor.type === 'hover')
                stepName += 'over ';
            else if (actionDescriptor.type === 'select')
                stepName += 'in ';
            else if(actionDescriptor.type === 'upload') {
                var fileNames = actionDescriptor.serviceInfo.fileNames;

                if(fileNames.join(''))
                    stepName += '"' + fileNames.join('", "') + '" file' + (fileNames.length > 1 ? 's' : '');
                else
                    stepName = 'Clean up file input';

                return stepName;
            }

            stepName += getElementName(element);

            var $label = $('label[for="' + element.id + '"]'),
                croppedLabelForElement = $label.length ? cropText($label.text()) : '';

            switch (tagName) {
                case 'body':
                case 'html':
                    break;

                case 'a':
                case 'map':
                case 'object':
                case 'output':
                    stepName += generateElementDescriptionByAttributes(['text', 'title', 'name']);
                    break;

                case 'area':
                case 'img':
                    stepName += generateElementDescriptionByAttributes(['title', 'alt']);
                    break;

                case 'form':
                case 'iframe':
                case 'keygen':
                case 'select':
                    stepName += generateElementDescriptionByAttributes(['title', 'name']);
                    break;

                case 'optgroup':
                case 'track':
                    stepName += generateElementDescriptionByAttributes(['label', 'title']);
                    break;

                case 'button':
                    stepName += generateElementDescriptionByAttributes(['text', 'value', 'title', 'name']);
                    break;

                case 'command':
                    stepName += generateElementDescriptionByAttributes(['text', 'label', 'title']);
                    break;

                case 'details':
                    var nameByText = generateElementDescriptionByAttributes(['text']);
                    if (nameByText)
                        stepName += nameByText;
                    else {
                        var $summary = $(element).children('summary');
                        if ($summary.length && $.trim($summary.text()))
                            stepName += ' "' + cropText($summary.text()) + '"';
                        else
                            stepName += generateElementDescriptionByAttributes(['title']);
                    }
                    break;

                case 'fieldset':
                    var $legend = $(element).children('legend');
                    if ($legend.length && $.trim($legend.text()))
                        stepName += ' "' + cropText($legend.text()) + '"';
                    else {
                        var nameWithoutLegend = generateElementDescriptionByAttributes(['text', 'title', 'name']);
                        if (nameWithoutLegend)
                            stepName += nameWithoutLegend;
                        else if ($legend.length && $legend[0].title)
                            stepName += ' "' + cropText($legend[0].title) + '"';
                    }
                    break;

                case 'figure':
                    var $figcaption = $(element).children('figcaption');
                    if ($figcaption.length && $.trim($figcaption.text()))
                        stepName += ' "' + cropText($figcaption.text()) + '"';
                    else
                        stepName += generateElementDescriptionByAttributes(['text', 'title']);
                    break;

                case 'input':
                    if (!elementType || (elementType && (elementType === 'text' || elementType === 'password' ||
                        elementType === 'hidden' || elementType === 'file'))) {
                        if (croppedLabelForElement)
                            stepName += ' "' + croppedLabelForElement + '"';
                        else stepName += generateElementDescriptionByAttributes(['title', 'name']);
                    }
                    else if (elementType && elementType === 'image') {
                        if (croppedLabelForElement)
                            stepName += ' "' + croppedLabelForElement + '"';
                        else stepName += generateElementDescriptionByAttributes(['title', 'alt', 'name']);
                    }
                    else if (elementType && (elementType === 'button' || elementType === 'submit' ||
                        elementType === 'reset')) {
                        if (generateElementDescriptionByAttributes(['value']))
                            stepName += generateElementDescriptionByAttributes(['value']);
                        else if (croppedLabelForElement)
                            stepName += ' "' + croppedLabelForElement + '"';
                        else
                            stepName += generateElementDescriptionByAttributes(['title', 'name']);
                    }
                    else if (elementType && (elementType === 'checkbox' || elementType === 'radio')) {
                        if (croppedLabelForElement)
                            stepName += ' "' + croppedLabelForElement + '"';
                        else
                            stepName += generateElementDescriptionByAttributes(['title', 'value', 'name']);
                    }
                    break;

                case 'menu':
                    stepName += generateElementDescriptionByAttributes(['text', 'label', 'title']);
                    break;

                case 'option':
                    stepName += generateElementDescriptionByAttributes(['label', 'text', 'title', 'value']);
                    break;

                case 'table':
                    var $caption = $(element).children('caption');
                    if ($caption.length && $.trim($caption.text()))
                        stepName += ' "' + cropText($caption.text()) + '"';
                    else
                        stepName += generateElementDescriptionByAttributes(['text', 'title']);
                    break;

                case 'textarea':
                    if (croppedLabelForElement)
                        stepName += ' "' + croppedLabelForElement + '"';
                    else
                        stepName += generateElementDescriptionByAttributes(['title', 'name']);
                    break;

                default :
                    stepName += generateElementDescriptionByAttributes(['text', 'title']);
            }

            if (elements) {
                if (elements.length === 2 && elements[0].tagName.toLowerCase() === 'select' &&
                    elements[1].tagName.toLowerCase() === 'select' && elements[0] === elements[1]) {
                    stepName += ' twice';
                }
                else {
                    $.each(elements, function (index, el) {
                        if (index !== 0) {
                            currentDescriptor = $.extend(currentDescriptor, actionDescriptor);
                            currentDescriptor.element = el;
                            delete currentDescriptor.elements;
                            currentName = exports.generateStepName(currentDescriptor);
                            stepName += ' and ' + currentName.charAt(0).toLowerCase() + currentName.substring(1);
                        }
                    });
                }
            }

            return stepName;
        };
    }
);
TestCafeClient.define('Recorder.Util', function (require, exports) {
    var Hammerhead = HammerheadClient.get('Hammerhead'),
        $ = Hammerhead.$,
        JSON = Hammerhead.JSON,
        StepNameGenerator = require('Recorder.StepNameGenerator'),
        ServiceCommands = require('Shared.ServiceCommands'),
        Transport = require('Base.Transport');

    exports.ELEMENT_PICKING_CLASSES = {
        elementFrame: 'element-frame',
        elementFramePart: 'element-frame-part'
    };

    exports.ELEMENTS_MARKER_CLASS = 'elements-marker';

    exports.BROWSER_DIALOG_INDEXES = {
        alert: 0,
        confirm: 1,
        prompt: 2,
        beforeUnload: 3
    };

    exports.getActionStepInfo = function (actionDescriptor) {
        var element = actionDescriptor.element;

        if (element)
            actionDescriptor.element = null;    //B253740

        var actionDescriptorClone = $.extend(true, {}, actionDescriptor);

        if (element) {
            actionDescriptor.element = element;
            actionDescriptorClone.element = element;
        }

        return {
            name: StepNameGenerator.generateStepName(actionDescriptor),
            actionDescriptor: actionDescriptorClone,
            selectors: actionDescriptor.serviceInfo && actionDescriptor.serviceInfo.selectors,
            iFrameSelectors: actionDescriptor.iFrameSelectors || null,
            currentSelectorIndex: 0,
            currentIFrameSelectorIndex: 0,
            useOffsets: actionDescriptor.serviceInfo && actionDescriptor.serviceInfo.useOffsets
        };
    };

    exports.getAssertionsStepInfo = function () {
        return {
            isAssertion: true,
            name: 'Assert',
            blocks: [
                /*{
                 assertions: [],
                 iFrameContext: 'context' || null
                 }, ...*/
            ]
        };
    };

    //NOTE: we should change string values in action arguments to integer values
    exports.parseStepArguments = function (stepInfo) {
        if (stepInfo.isAssertion)
            return;

        var actionDescr = stepInfo.actionDescriptor;

        if (actionDescr.type === 'drag') {
            if (actionDescr.apiArguments.dragOffsetX === '')
                actionDescr.apiArguments.dragOffsetX = 0;
            if (actionDescr.apiArguments.dragOffsetX === '')
                actionDescr.apiArguments.dragOffsetX = 0;
        }

        if (actionDescr.type === 'wait') {
            if (actionDescr.apiArguments.ms === '')
                actionDescr.apiArguments.ms = 0;
        }
    };

    //NOTE: modify stepInfo to parsing on server
    exports.getServerCompatibleStepInfo = function (stepInfo) {
        if (stepInfo.isAssertion)
            return stepInfo;
        else
            return exports.getServerCompatibleActionStepInfo(stepInfo);
    };

    exports.sendStepsInfo = function (stepsInfo, hasUnsavedChanges, callback, getStepsScript) {
        var res = [];

        for (var i = 0; i < stepsInfo.length; i++)
            res.push(exports.getServerCompatibleStepInfo(stepsInfo[i]));

        var setStepsInfoMsg = {
            cmd: ServiceCommands.STEPS_INFO_SET,
            stepsInfo: res,
            hasUnsavedChanges: hasUnsavedChanges,
            getStepsScript: getStepsScript
        };

        Transport.queuedAsyncServiceMsg(setStepsInfoMsg, callback);
    };

    exports.getServerCompatibleActionStepInfo = function (stepInfo) {
        var res = {
            action: stepInfo.actionDescriptor.type,
            actionArgs: [],
            failed: stepInfo.failed || false,
            error: stepInfo.error || null,
            dialogError: stepInfo.dialogError || null
        };

        //NOTE: We can not use jquery extend method because it causes an 'Permission denied' error
        // if the action contains an element of iframe that has been deleted.
        // Therefore, we should copy in an empty object all the necessary properties of stepInfo object (B253740)
        for (var option in stepInfo) {
            if (stepInfo.hasOwnProperty(option) && !/actiondescriptor|actionargs/.test(option.toLowerCase())) {
                //NOTE: all value passed by reference must be copied separately (such as selectors, nativeDialogHandlers)
                if (/selectors/.test(option.toLowerCase()) && typeof stepInfo[option] !== 'undefined')
                    res[option] = (stepInfo[option] && stepInfo[option].length) ? $.extend(true, [], stepInfo[option]) : null;
                if (/nativedialoghandlers/.test(option.toLowerCase()) && typeof stepInfo[option] !== 'undefined')
                    res[option] = (stepInfo[option] && stepInfo[option].length) ? $.extend(true, [], stepInfo[option]) : null;
                else
                    res[option] = stepInfo[option];
            }
        }

        var apiArguments = stepInfo.actionDescriptor.apiArguments,
            actionOptions = null;

        if (stepInfo.actionDescriptor.type === 'drag') {
            res.actionArgs.push({ dragOffsetX: apiArguments.dragOffsetX});
            res.actionArgs.push({ dragOffsetY: apiArguments.dragOffsetY });
        }

        if (stepInfo.actionDescriptor.type === 'type')
            res.actionArgs.push({ text: apiArguments.text });

        if (stepInfo.actionDescriptor.type === 'press')
            res.actionArgs.push({ keysCommand: apiArguments.keysCommand });

        if (stepInfo.actionDescriptor.type === 'wait')
            res.actionArgs.push({ ms: apiArguments.ms });

        if (stepInfo.actionDescriptor.type === 'select') {
            res.actionArgs.push({ startPos: apiArguments.startPos });
            res.actionArgs.push({ endPos: apiArguments.endPos });
        }

        if (stepInfo.actionDescriptor.type === 'upload')
            res.actionArgs.push({ files: apiArguments.files});

        if (/click|drag|type|hover/.test(stepInfo.actionDescriptor.type) && apiArguments.options) {
            actionOptions = $.extend(true, {}, apiArguments.options);

            if (actionOptions)
                res.actionArgs.push({ options: actionOptions});
        }

        return res;
    };

    exports.parseServerCompatibleStepInfo = function (stepInfo) {
        if (stepInfo.isAssertion)
            return stepInfo;
        else
            return exports.parseServerCompatibleActionStepInfo(stepInfo);
    };

    exports.parseServerCompatibleActionStepInfo = function (stepInfo) {
        var res = $.extend(true, {}, stepInfo, {
            actionDescriptor: {
                type: stepInfo.action,
                apiArguments: {},
                failed: stepInfo.failed,
                error: null
            }
        });

        for (var i = 0; i < stepInfo.actionArgs.length; i++) {
            var arg = stepInfo.actionArgs[i];

            for (var field in arg) {
                if (arg.hasOwnProperty(field))
                    res.actionDescriptor.apiArguments[field] = arg[field];
            }
        }

        return res;
    };

    var storedStates = {};

    exports.serializeStepInfo = function (stepInfo) {
        if (!stepInfo.id)
            stepInfo.id = Date.now();

        if (stepInfo.actionDescriptor) {
            if (stepInfo.actionDescriptor.serviceInfo && stepInfo.actionDescriptor.serviceInfo.prevPageState) {
                storedStates[stepInfo.id] = stepInfo.actionDescriptor.serviceInfo.prevPageState;
                stepInfo.actionDescriptor.serviceInfo.prevPageState = null;
            }

            stepInfo.actionDescriptor.element = null;
        }

        return JSON.stringify(stepInfo);
    };

    exports.parseStepInfo = function (serializedStepInfo) {
        var stepInfo = JSON.parse(serializedStepInfo);

        if (stepInfo.id && storedStates[stepInfo.id])
            stepInfo.actionDescriptor.serviceInfo.prevPageState = storedStates[stepInfo.id];

        return stepInfo;
    };

    exports.getNativeDialogs = function () {
        return (function (_alert, _confirm, _prompt) {
            return {
                alert: function (message) {
                    return _alert.call(window, message);
                },
                confirm: function (message) {
                    return _confirm.call(window, message);
                },
                prompt: function (message) {
                    return _prompt.call(window, message);
                }
            };
        })(window.alert, window.confirm, window.prompt);
    };
});
TestCafeClient.define('Recorder.IFrameRecorder', function (require) {
    var Hammerhead = HammerheadClient.get('Hammerhead'),
        $ = Hammerhead.$,
        MessageSandbox = Hammerhead.MessageSandbox,
        Util = Hammerhead.Util,
        JavascriptExecutor = require('Base.JavascriptExecutor'),

        Settings = require('Settings'),
        SelectorGenerator = require('Recorder.SelectorGenerator'),
        SharedConst = require('Shared.Const'),
        Automation = require('Automation'),
        EventListener = require('Recorder.EventListener'),
        RecorderBase = require('Recorder.RecorderBase'),
        RecorderUI = require('UI.Recorder'),
        RecorderUtil = require('Recorder.Util'),
        PageState = Hammerhead.PageState,
        ElementPicker = require('Recorder.ElementPicker');

    var IFrameRecorder = this.exports = function (storedNativeDialogs) {
        RecorderBase.apply(this, [storedNativeDialogs]);
    };

    //NOTE: the window.top property may be changed after an iFrame is removed from DOM in IE, so we save it on script initializing
    var topWindow = window.top;
    
    Util.inherit(IFrameRecorder, RecorderBase);

    IFrameRecorder.prototype.completeInitialization = function () {
        var initializedMsg = {
            cmd: RecorderBase.IFRAME_RECORDER_INITIALIZED_CMD
        };

        MessageSandbox.sendServiceMsg(initializedMsg, topWindow);

        var recorder = this;

        MessageSandbox.on(MessageSandbox.SERVICE_MSG_RECEIVED, function (e) {
            var message = e.message;

            switch (message.cmd) {
                case RecorderBase.START_IFRAME_RECORDER_CMD:
                    Settings.PLAYBACK = false;
                    recorder.start();

                    if (message.initNativeDialogs)
                        recorder.initNativeDialogsHandling();
                    break;

                case RecorderBase.IFRAME_CONFIRM_ACTION_RESPONSE_CMD:
                    if (typeof recorder.currentConfirmationCallback === 'function') {
                        recorder.currentConfirmationCallback(message.confirmed,
                            message.stepInfo ? RecorderUtil.parseStepInfo(message.stepInfo) : null);

                        recorder.currentConfirmationCallback = null;
                    }

                    break;

                case RecorderBase.IFRAME_TYPING_STATE_CHANGED_RESPONSE_CMD:
                    if (typeof recorder.currentCompleteTypingCallback === 'function') {
                        recorder.currentCompleteTypingCallback();
                        recorder.currentCompleteTypingCallback = null;
                    }
                    break;

                case RecorderBase.IFRAME_CLICK_EDITOR_STATE_CHANGED_RESPONSE_CMD:
                    if (typeof recorder.currentCompleteClickEditorCallback === 'function') {
                        recorder.currentCompleteClickEditorCallback();
                        recorder.currentCompleteClickEditorCallback = null;
                    }
                    break;

                case RecorderBase.IFRAME_START_PICKING_ELEMENT_CMD:
                    recorder._startPickingElement();
                    break;

                case RecorderBase.IFRAME_STOP_PICKING_ELEMENT_CMD:
                    recorder._stopPickingElement();
                    break;

                case RecorderBase.IFRAME_HOVER_ACTION_RECORDED_CMD:
                    recorder._hoverActionRecorded(message.elementSelectors, message.options);
                    break;

                case RecorderBase.IFRAME_CREATE_ALL_DEFERRED_ACTIONS_CMD:
                    //NOTE: save deferred actions in iframe
                    EventListener.setPreventingMode(true);

                    recorder._createAllDeferred();

                    EventListener.setPreventingMode(false);
                    break;
            }
        });

        this.currentConfirmationCallback = null;
        this.currentCompleteTypingCallback = null;
        this.currentCompleteClickEditorCallback = null;
    };

    IFrameRecorder.prototype.start = function (initNativeDialogs) {
        IFrameRecorder.base.start.call(this, initNativeDialogs);
    };

    IFrameRecorder.prototype._saveDialogHandler = function (dialog, retValue) {
        var sendSaveDialogHandlerRequest = function () {
            var msg = {
                cmd: RecorderBase.IFRAME_SAVE_DIALOG_HANDLER_CMD,
                dialog: dialog,
                retValue: retValue
            };

            MessageSandbox.sendServiceMsg(msg, topWindow);
        };

        if (this.stepSaving && dialog !== 'beforeUnload') {
            var stepSavingResponse = function (e) {
                if (e.message.cmd === RecorderBase.IFRAME_SAVE_STEP_RESPONSE_CMD) {
                    MessageSandbox.off(MessageSandbox.SERVICE_MSG_RECEIVED, stepSavingResponse);

                    sendSaveDialogHandlerRequest();
                }
            };

            MessageSandbox.on(MessageSandbox.SERVICE_MSG_RECEIVED, stepSavingResponse);
        }
        else
            sendSaveDialogHandlerRequest();
    };

    IFrameRecorder.prototype._initUi = function () {
        var recorder = this;

        this.recordingManagerOptions.typingStateChangedCallback = function (isTypingStarted, completeCallback) {
            if (isTypingStarted)
                recorder.currentCompleteTypingCallback = completeCallback;

            var msg = {
                cmd: RecorderBase.IFRAME_TYPING_STATE_CHANGED_REQUEST_CMD,
                rect: Util.getElementClientRectangle(Util.getActiveElement()),
                isTypingStarted: isTypingStarted
            };

            MessageSandbox.sendServiceMsg(msg, topWindow);
        };

        this.recordingManagerOptions.clickEditorStateChangedCallback = function (isClickOnEditorStarted, completeCallback) {
            if (isClickOnEditorStarted)
                recorder.currentCompleteClickEditorCallback = completeCallback;

            var msg = {
                cmd: RecorderBase.IFRAME_CLICK_EDITOR_STATE_CHANGED_REQUEST_CMD,
                rect: Util.getElementClientRectangle(Util.getActiveElement()),
                isClickOnEditorStarted: isClickOnEditorStarted
            };

            MessageSandbox.sendServiceMsg(msg, topWindow);
        };

        function shortcutPressedStart(shortcut) {
            var msg = {
                cmd: RecorderBase.IFRAME_SHORTCUT_PRESSED_START_CMD,
                shortcut: shortcut
            };

            MessageSandbox.sendServiceMsg(msg, topWindow);
        }

        function shortcutPressedEnd(shortcut) {
            var msg = {
                cmd: RecorderBase.IFRAME_SHORTCUT_PRESSED_END_CMD,
                shortcut: shortcut
            };

            MessageSandbox.sendServiceMsg(msg, topWindow);
        }

        function getShortcutHandler(shortcut) {
            return {
                start: function () {
                    EventListener.setPreventingMode(true);

                    shortcutPressedStart(shortcut);
                },
                end: function () {
                    //HACK: if wait action shortcut was pressed in iframe we need create iframe's deferred actions immediately
                    //to save step (async action) before creation wait action
                    if (shortcut === Automation.ADD_ACTION_SHORTCUTS.wait) {
                        recorder._createAllDeferred();
                    }

                    shortcutPressedEnd(shortcut);
                    EventListener.setPreventingMode(false);
                }
            };
        }

        for (var shortcut in RecorderUI.Shortcuts) {
            if (RecorderUI.Shortcuts.hasOwnProperty(shortcut))
                recorder.recordingManagerOptions.executableShortcuts[shortcut] = getShortcutHandler(shortcut);
        }
    };

    IFrameRecorder.prototype._startPickingElement = function () {
        IFrameRecorder.base._startPickingElement.call(this);
        EventListener.pause();

        this.elementPickCallback = function (elementSelectors, iFrameSelectors, options) {
            MessageSandbox.sendServiceMsg({
                cmd: RecorderBase.IFRAME_ELEMENT_PICKED_CMD,
                elementSelector: elementSelectors,
                iFrameSelectors: iFrameSelectors,
                options: options
            }, topWindow);
        };

        ElementPicker.start(this.elementPickCallback);
    };

    IFrameRecorder.prototype._stopPickingElement = function () {
        IFrameRecorder.base._stopPickingElement.call(this);
        EventListener.resume();
    };

    //Upload

    IFrameRecorder.prototype._initHammerheadEventHandling = function () {
        var recorder = this;

        Hammerhead.on(Hammerhead.FILE_UPLOADING_EVENT, function (fileNames, input, callback) {
            var selectors = SelectorGenerator.generate($(input)),
                uploadAllowedHandler = function (e) {
                    if (e.message.cmd === RecorderBase.IFRAME_UPLOAD_ALLOWED_CMD) {
                        MessageSandbox.off(MessageSandbox.SERVICE_MSG_RECEIVED, uploadAllowedHandler);
                        callback(function (errs) {
                            var filePaths = fileNames.map(function (name) {
                                return SharedConst.UPLOADED_FILES_PATH + name;
                            });

                            recorder._onActionParsed({
                                type: 'upload',
                                apiArguments: {
                                    files: filePaths
                                },
                                serviceInfo: {
                                    selectors: SelectorGenerator.generate($(input)),
                                    fileNames: fileNames
                                }
                            });

                            MessageSandbox.sendServiceMsg({
                                cmd: RecorderBase.IFRAME_UPLOAD_COMPLETED_CMD,
                                errs: errs
                            }, topWindow);
                        });
                    }
                };

            MessageSandbox.on(MessageSandbox.SERVICE_MSG_RECEIVED, uploadAllowedHandler);
            MessageSandbox.sendServiceMsg({
                cmd: RecorderBase.IFRAME_UPLOAD_REQUEST_TO_UPLOAD_CMD,
                fileNames: fileNames,
                selectors: selectors
            }, topWindow);
        });
    };

    //Recording management
    IFrameRecorder.prototype._confirmAction = function (parsedStepInfo, callback) {
        var recorder = this,
            pageState = PageState.saveState();

        var confirmActionRequestMsg = {
            cmd: RecorderBase.IFRAME_CONFIRM_ACTION_REQUEST_CMD,
            stepInfo: parsedStepInfo ? RecorderUtil.serializeStepInfo(parsedStepInfo) : null
        };

        this.currentConfirmationCallback = function () {
            var args = arguments;

            PageState.restoreState(pageState, true, function () {
                callback.apply(recorder, args);
            });
        };

        MessageSandbox.sendServiceMsg(confirmActionRequestMsg, topWindow);
    };

    IFrameRecorder.prototype._saveStep = function (stepInfo) {
        this.stepSaving = true;

        var iFrameRecorder = this,
            stepSavingResponse = function (e) {
                if (e.message.cmd === RecorderBase.IFRAME_SAVE_STEP_RESPONSE_CMD) {
                    MessageSandbox.off(MessageSandbox.SERVICE_MSG_RECEIVED, stepSavingResponse);
                    iFrameRecorder.stepSaving = false;
                }
            };

        MessageSandbox.on(MessageSandbox.SERVICE_MSG_RECEIVED, stepSavingResponse);

        var saveStepMsg = {
            cmd: RecorderBase.IFRAME_SAVE_STEP_REQUEST_CMD,
            stepInfo: RecorderUtil.serializeStepInfo(stepInfo)
        };

        MessageSandbox.sendServiceMsg(saveStepMsg, topWindow);
    };

    IFrameRecorder.prototype._hoverActionRecorded = function (elementSelectors, options) {
        var actionDescriptor = $.extend(Automation.defaultMouseActionDescriptor, {
            type: 'hover',
            element: JavascriptExecutor.parseSelectorSync(elementSelectors[0].selector).$elements[0],
            apiArguments: {
                options: options
            },
            selector: elementSelectors[0].selector,
            serviceInfo: {
                selectors: elementSelectors
            }
        });

        this._onActionParsed(actionDescriptor);
    };
});
    };

    window.initTestCafeRecorder(window);
})();