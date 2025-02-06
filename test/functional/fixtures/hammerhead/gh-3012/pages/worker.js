const asyncThunkSymbol = 'asyncThunkSymbol';

function buildCreateSlice ({ creators } = {}) {
    return creators?.asyncThunk?.[asyncThunkSymbol];
}

try {
    const shouldBeUndefined = buildCreateSlice();

    postMessage(`OK: ${shouldBeUndefined}`);
}
catch (error) {
    postMessage(error);
}
