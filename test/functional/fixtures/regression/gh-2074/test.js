const expect = require('chai').expect;

describe('[Regression](GH-2074)', function () {
    it('Should execute test located in external module', function () {
        return runTests('testcafe-fixtures/index.js', null, { shouldFail: true, disableTestSyntaxValidation: true })
            .catch(errors => {
                Object.values(errors).forEach(err => {
                    expect(err[0]).contains('test is executed');
                });
            });
    });
});

