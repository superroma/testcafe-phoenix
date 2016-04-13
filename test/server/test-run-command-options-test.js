var expect         = require('chai').expect;
var OffsetOptions  = require('../../lib/test-run/commands/options').OffsetOptions;
var MouseOptions   = require('../../lib/test-run/commands/options').MouseOptions;
var ClickOptions   = require('../../lib/test-run/commands/options').ClickOptions;
var MoveOptions    = require('../../lib/test-run/commands/options').MoveOptions;
var TypeOptions    = require('../../lib/test-run/commands/options').TypeOptions;
var ERROR_TYPE     = require('../../lib/errors/test-run/type');
var ERROR_CATEGORY = require('../../lib/errors/test-run/category');

// NOTE: chai's throws doesn't perform deep comparison of error objects
function assertThrow (fn, expectedErr) {
    var actualErr = null;

    try {
        fn();
    }
    catch (err) {
        actualErr = err;
    }

    expect(actualErr).eql(expectedErr);
}

describe('Test run command options', function () {
    describe('Construction from object and serialization', function () {
        it('Should create OffsetOptions from object', function () {
            var options = new OffsetOptions({
                offsetY: 15,
                dummy:   false
            }, false);

            expect(JSON.parse(JSON.stringify(options))).eql({
                offsetX: 0,
                offsetY: 15
            });
        });

        it('Should create MouseOptions from object', function () {
            var options = new MouseOptions({
                offsetX: 15,
                dummy:   false,

                modifiers: {
                    ctrl:  true,
                    shift: true,
                    dummy: 'yo'
                }
            }, false);

            expect(JSON.parse(JSON.stringify(options))).eql({
                offsetX: 15,
                offsetY: 0,

                modifiers: {
                    ctrl:  true,
                    alt:   false,
                    shift: true,
                    meta:  false
                }
            });
        });

        it('Should create ClickOptions from object', function () {
            var options = new ClickOptions({
                offsetX:  15,
                caretPos: 20,
                dummy:    false,

                modifiers: {
                    ctrl:  true,
                    shift: true,
                    dummy: 'yo'
                }
            }, false);

            expect(JSON.parse(JSON.stringify(options))).eql({
                offsetX:  15,
                offsetY:  0,
                caretPos: 20,

                modifiers: {
                    ctrl:  true,
                    alt:   false,
                    shift: true,
                    meta:  false
                }
            });
        });

        it('Should create MoveOptions from object', function () {
            var options = new MoveOptions({
                offsetY:     15,
                dragOffsetX: 20,
                dummy:       false,
                speed:       20,
                dragMode:    true,

                modifiers: {
                    ctrl:  true,
                    shift: true,
                    dummy: 'yo'
                }
            }, false);

            expect(JSON.parse(JSON.stringify(options))).eql({
                offsetX:       0,
                offsetY:       15,
                speed:         20,
                minMovingTime: null,
                dragMode:      true,

                modifiers: {
                    ctrl:  true,
                    alt:   false,
                    shift: true,
                    meta:  false
                }
            });
        });

        it('Should create TypeOptions from object', function () {
            var options = new TypeOptions({
                offsetX:  15,
                caretPos: 20,
                replace:  true,
                dummy:    false,

                modifiers: {
                    ctrl:  true,
                    shift: true,
                    dummy: 'yo'
                }
            }, false);

            expect(JSON.parse(JSON.stringify(options))).eql({
                offsetX:  15,
                offsetY:  0,
                caretPos: 20,
                replace:  true,

                modifiers: {
                    ctrl:  true,
                    alt:   false,
                    shift: true,
                    meta:  false
                }
            });
        });
    });

    describe('Validation', function () {
        it('Should validate OffsetOptions', function () {
            assertThrow(
                function () {
                    return new OffsetOptions({ offsetX: null }, true);
                },
                {
                    isTestCafeError: true,
                    category:        ERROR_CATEGORY.actionError,
                    type:            ERROR_TYPE.actionPositiveIntegerOptionError,
                    actualValue:     'object',
                    optionName:      'offsetX',
                    callsite:        null
                }
            );

            assertThrow(
                function () {
                    return new OffsetOptions({ offsetY: -3 }, true);
                },
                {
                    isTestCafeError: true,
                    category:        ERROR_CATEGORY.actionError,
                    type:            ERROR_TYPE.actionPositiveIntegerOptionError,
                    actualValue:     -3,
                    optionName:      'offsetY',
                    callsite:        null
                }
            );

            assertThrow(
                function () {
                    return new OffsetOptions({ offsetX: NaN }, true);
                },
                {
                    isTestCafeError: true,
                    category:        ERROR_CATEGORY.actionError,
                    type:            ERROR_TYPE.actionPositiveIntegerOptionError,
                    actualValue:     NaN,
                    optionName:      'offsetX',
                    callsite:        null
                }
            );

            assertThrow(
                function () {
                    return new OffsetOptions({ offsetX: 3.14 }, true);
                },
                {
                    isTestCafeError: true,
                    category:        ERROR_CATEGORY.actionError,
                    type:            ERROR_TYPE.actionPositiveIntegerOptionError,
                    actualValue:     3.14,
                    optionName:      'offsetX',
                    callsite:        null
                }
            );
        });

        it('Should validate MouseOptions', function () {
            assertThrow(
                function () {
                    return new MouseOptions({ modifiers: { ctrl: 42 } }, true);
                },
                {
                    isTestCafeError: true,
                    category:        ERROR_CATEGORY.actionError,
                    type:            ERROR_TYPE.actionBooleanOptionError,
                    actualValue:     'number',
                    optionName:      'modifiers.ctrl',
                    callsite:        null
                }
            );

            assertThrow(
                function () {
                    return new MouseOptions({ modifiers: { alt: 42 } }, true);
                },
                {
                    isTestCafeError: true,
                    category:        ERROR_CATEGORY.actionError,
                    type:            ERROR_TYPE.actionBooleanOptionError,
                    actualValue:     'number',
                    optionName:      'modifiers.alt',
                    callsite:        null
                }
            );

            assertThrow(
                function () {
                    return new MouseOptions({ modifiers: { shift: 42 } }, true);
                },
                {
                    isTestCafeError: true,
                    category:        ERROR_CATEGORY.actionError,
                    type:            ERROR_TYPE.actionBooleanOptionError,
                    actualValue:     'number',
                    optionName:      'modifiers.shift',
                    callsite:        null
                }
            );

            assertThrow(
                function () {
                    return new MouseOptions({ modifiers: { meta: 42 } }, true);
                },
                {
                    isTestCafeError: true,
                    category:        ERROR_CATEGORY.actionError,
                    type:            ERROR_TYPE.actionBooleanOptionError,
                    actualValue:     'number',
                    optionName:      'modifiers.meta',
                    callsite:        null
                }
            );
        });

        it('Should validate ClickOptions', function () {
            assertThrow(
                function () {
                    return new ClickOptions({ caretPos: -1 }, true);
                },
                {
                    isTestCafeError: true,
                    category:        ERROR_CATEGORY.actionError,
                    type:            ERROR_TYPE.actionPositiveIntegerOptionError,
                    actualValue:     -1,
                    optionName:      'caretPos',
                    callsite:        null
                }
            );

            assertThrow(
                function () {
                    return new ClickOptions({ caretPos: 3.14 }, true);
                },
                {
                    isTestCafeError: true,
                    category:        ERROR_CATEGORY.actionError,
                    type:            ERROR_TYPE.actionPositiveIntegerOptionError,
                    actualValue:     3.14,
                    optionName:      'caretPos',
                    callsite:        null
                }
            );
        });

        it('Should validate TypeOptions', function () {
            assertThrow(
                function () {
                    return new TypeOptions({ replace: 42 }, true);
                },
                {
                    isTestCafeError: true,
                    category:        ERROR_CATEGORY.actionError,
                    type:            ERROR_TYPE.actionBooleanOptionError,
                    actualValue:     'number',
                    optionName:      'replace',
                    callsite:        null
                }
            );
        });

    });
});
