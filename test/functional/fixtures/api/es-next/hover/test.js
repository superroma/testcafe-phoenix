var expect = require('chai').expect;

describe('[API] Hover action', function () {
    it('Should run hover over containers', function () {
        return runTests('./testcafe-fixtures/hover-test.js', 'Hover over containers', { shouldFail: true, only: 'chrome' })
            .catch(function (errs) {
                expect(errs[0]).to.contains('Hover on inputs raised');
                expect(errs[0]).to.contains(' >  8 |    await t.hover(\'#container2\');');
            });
    });

    it('Should validate options', function () {
        return runTests('./testcafe-fixtures/hover-test.js', 'Incorrect action option', { shouldFail: true, only: 'chrome' })
            .catch(function (errs) {
                expect(errs[0]).to.contains('Action option offsetX is expected to be a positive integer, but it was NaN.');
                expect(errs[0]).to.contains(' > 16 |    await t.hover(\'#container1\', { offsetX: NaN });');
            });
    });

    it('Should validate selector', function () {
        return runTests('./testcafe-fixtures/hover-test.js', 'Incorrect action selector', { shouldFail: true, only: 'chrome' })
            .catch(function (errs) {
                expect(errs[0]).to.contains('The selector is expected to be a string, but it was undefined.');
                expect(errs[0]).to.contains(' > 12 |    await t.hover(void 0);');
            });
    });
});
