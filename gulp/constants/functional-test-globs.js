const MULTIPLE_WINDOWS_TESTS_GLOB = 'test/functional/fixtures/multiple-windows/test.js';
const COMPILER_SERVICE_TESTS_GLOB = 'test/functional/fixtures/compiler-service/test.js';
const LEGACY_TESTS_GLOB           = 'test/functional/legacy-fixtures/**/test.js';
const BASIC_TESTS_GLOB            = 'test/functional/fixtures/**/test.js';

const TESTS_GLOB = [
    BASIC_TESTS_GLOB,
    `!${MULTIPLE_WINDOWS_TESTS_GLOB}`,
    `!${COMPILER_SERVICE_TESTS_GLOB}`,
];

const DEBUG_GLOB = [
    BASIC_TESTS_GLOB,
    COMPILER_SERVICE_TESTS_GLOB,
    '!test/functional/fixtures/multiple-windows/test.js',
    '!test/functional/fixtures/regression/gh-1907/test.js',
    '!test/functional/fixtures/screenshots-on-fails/test.js',
    '!test/functional/fixtures/api/es-next/take-screenshot/test',
];

module.exports = {
    TESTS_GLOB,
    LEGACY_TESTS_GLOB,
    MULTIPLE_WINDOWS_TESTS_GLOB,
    BASIC_TESTS_GLOB,
    COMPILER_SERVICE_TESTS_GLOB,
    DEBUG_GLOB,
};
