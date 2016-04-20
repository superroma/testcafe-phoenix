var expect = require('chai').expect;

describe('Element availability timeout', function () {
    it("Should pass if the element's availability timeout exceeds time required for the element to appear", function () {
        return runTests('testcafe-fixtures/waiting-element-timeout-test.js', 'Wait for element appearance before click',
            { elementAvailabilityTimeout: 2500 });
    });

    it("Should fail if the element's availability timeout is less than time required for the element to appear", function () {
        return runTests('testcafe-fixtures/waiting-element-timeout-test.js', 'Wait for element appearance before click',
            { shouldFail: true, elementAvailabilityTimeout: 500 })
            .catch(function (errs) {
                expect(errs[0]).to.contains('The element that matches the specified selector is not visible.');
            });
    });

    it("Should fail if the element's availability timeout is less than the time required for the element to appear (legacy)", function () {
        return runTests('testcafe-fixtures/waiting-element-timeout.test.js', 'Wait for element appearance before click',
            { shouldFail: true, elementAvailabilityTimeout: 500 })
            .catch(function (errs) {
                var expectedError = [
                    'Error at step "2.Click on button":',
                    '',
                    "act.click('#button2');",
                    '',
                    'A target element \<button id="button2"\> of the click action is not visible.',
                    'If this element should appear when you are hovering over another',
                    'element, make sure that you properly recorded the hover action.'
                ].join(' ');

                expect(errs[0]).eql(expectedError);
            });
    });
});
