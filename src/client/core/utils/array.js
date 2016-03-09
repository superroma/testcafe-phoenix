var nativeIndexOf = Array.prototype.indexOf;
var nativeForEach = Array.prototype.forEach;
var nativeSome    = Array.prototype.some;
var nativeMap     = Array.prototype.map;
var nativeFilter  = Array.prototype.filter;
var nativeReverse = Array.prototype.reverse;
var nativeReduce  = Array.prototype.reduce;
var nativeSplice  = Array.prototype.splice;

export function toArray (arg) {
    var arr    = [];
    var length = arg.length;

    for (var i = 0; i < length; i++)
        arr.push(arg[i]);

    return arr;
}

export function reverse (arr) {
    return nativeReverse.call(arr);
}

export function isArray (arg) {
    return Object.prototype.toString.call(arg) === '[object Array]';
}

export function find (arr, callback) {
    var length = arr.length;

    for (var i = 0; i < length; i++) {
        if (callback(arr[i], i, arr))
            return arr[i];
    }

    return null;
}

export function indexOf (arr, arg) {
    return nativeIndexOf.call(arr, arg);
}

export function forEach (arr, callback) {
    nativeForEach.call(arr, callback);
}

export function some (arr, callback) {
    return nativeSome.call(arr, callback);
}

export function map (arr, callback) {
    return nativeMap.call(arr, callback);
}

export function filter (arr, callback) {
    return nativeFilter.call(arr, callback);
}

export function reduce (arr, callback, initialValue) {
    return nativeReduce.call(arr, callback, initialValue);
}

export function remove (arr, item) {
    var index = indexOf(arr, item);

    if (index > -1)
        nativeSplice.call(arr, index, 1);
}
