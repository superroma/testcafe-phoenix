export default function (forbiddenCharsList) {
    return forbiddenCharsList.map(charInfo => `\t"${charInfo.char}" at index ${charInfo.index}\n`).join('');
}
