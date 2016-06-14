var expect = require('chai').expect;

describe('[API] Selector', function () {
    it('Should provide basic properties in HTMLElement snapshots', function () {
        return runTests('./testcafe-fixtures/selector-test.js', 'HTMLElement snapshot basic properties');
    });

    it('Should provide basic properties in SVGElement snapshots', function () {
        return runTests('./testcafe-fixtures/selector-test.js', 'SVGElement snapshot basic properties');
    });

    it('Should provide input-specific properties in element snapshots', function () {
        return runTests('./testcafe-fixtures/selector-test.js', 'Input-specific element snapshot properties');
    });

    it('Should provide `innerText` property in element snapshots', function () {
        return runTests('./testcafe-fixtures/selector-test.js', '`innerText` element snapshot property');
    });

    it('Should provide node snapshots for non-element nodes', function () {
        return runTests('./testcafe-fixtures/selector-test.js', 'Non-element node snapshots');
    });

    it('Should accept string as constructor argument', function () {
        return runTests('./testcafe-fixtures/selector-test.js', 'String ctor argument');
    });

    it('Should wait for element to appear in DOM', function () {
        return runTests('./testcafe-fixtures/selector-test.js', 'Wait for element in DOM', { elementAvailabilityTimeout: 2500 });
    });

    it('Should return `null` or `undefined` if element does not appear within given time', function () {
        return runTests('./testcafe-fixtures/selector-test.js', 'Element do not appear', { elementAvailabilityTimeout: 300 });
    });

    describe('Errors', function () {
        it('Should handle errors in Selector code', function () {
            return runTests('./testcafe-fixtures/selector-test.js', 'Error in code', { shouldFail: true })
                .catch(function (errs) {
                    expect(errs[0]).contains('An error occurred in Selector code:');
                    expect(errs[0]).contains('Error: Hey ya!');
                    expect(errs[0]).contains('> 213 |    await fn();');
                });
        });

        it('Should raise an error if Selector ctor argument is not a function or string', function () {
            return runTests('./testcafe-fixtures/selector-test.js', 'Selector fn is not a function or string', {
                shouldFail: true,
                only:       'chrome'
            }).catch(function (errs) {
                expect(errs[0].indexOf(
                    'Selector code is expected to be specified as a function or string, but "number" was passed.'
                )).eql(0);

                expect(errs[0]).contains('> 183 |    await Selector(123)();');
            });
        });
    });
});
