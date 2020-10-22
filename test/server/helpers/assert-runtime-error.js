const { sep }       = require('path');
const stripAnsi     = require('strip-ansi');
const { expect }    = require('chai');
const stackParser   = require('error-stack-parser');
const { castArray } = require('lodash');


function assertStack (err, expected) {
    // HACK: stackParser can't handle empty stacks correctly
    // (it treats error messages as stack frames).
    // Therefore we add this dummy stack frame to make things work
    if (!expected.stackTop)
        err.stack += '\n    at (<empty-marker>:1:1)';

    const parsedStack = stackParser.parse(err);

    if (expected.stackTop) {
        const expectedStackTop = castArray(expected.stackTop);

        parsedStack.forEach(function (frame, idx) {
            const filename   = frame.fileName;
            const isInternal = frame.fileName.indexOf('internal/') === 0 ||
                               frame.fileName.indexOf('node:') === 0 &&
                               frame.fileName.indexOf(sep) < 0;

            // NOTE: assert that stack is clean from internals
            expect(isInternal).to.be.false;
            expect(filename).not.to.contain(sep + 'babel-');
            expect(filename).not.to.contain(sep + 'babylon' + sep);
            expect(filename).not.to.contain(sep + 'core-js' + sep);

            if (expectedStackTop[idx])
                expect(filename).eql(expectedStackTop[idx]);
        });
    }
    else {
        expect(parsedStack.length).eql(1);
        expect(parsedStack[0].fileName).eql('<empty-marker>');
    }
}

function assertRuntimeError (err, expected, messageContainsStack) {
    // NOTE: https://github.com/nodejs/node/issues/27388
    if (messageContainsStack)
        expect(err.message.startsWith(expected.message)).to.be.true;
    else
        expect(err.message).eql(expected.message);

    expect(err.stack.startsWith(expected.message)).to.be.true;

    assertStack(err, expected);
}

function assertAPIError (err, expected) {
    assertRuntimeError(err, expected);

    expect(expected.callsite).to.not.empty;
    expect(err.stack.startsWith(expected.message + '\n\n' + expected.callsite)).to.be.true;
    expect(stripAnsi(err.coloredStack)).eql(err.stack);
}

// NOTE: chai's throws doesn't perform deep comparison of error objects
function assertThrow (fn, expectedErr) {
    let actualErr = null;

    try {
        fn();
    }
    catch (err) {
        actualErr = err;
    }

    expect(actualErr).eql(expectedErr);
}

module.exports = {
    assertError:    assertRuntimeError,
    assertAPIError: assertAPIError,
    assertThrow:    assertThrow
};
