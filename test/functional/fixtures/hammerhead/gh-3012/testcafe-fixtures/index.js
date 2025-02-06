fixture `Worker`
    .page `http://localhost:3000/fixtures/hammerhead/gh-3012/pages/index.html`;

test('Should not break due to undefined optional chaining', async t => {
    const { log } = await t.getBrowserConsoleMessages();

    await t.expect(log[0]).match(/^OK:/);
});
