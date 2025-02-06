describe('Worker header', function () {
    it('Should not break due to undefined optional chaining', function () {
        return runTests('testcafe-fixtures/index.js', null);
    });
});
