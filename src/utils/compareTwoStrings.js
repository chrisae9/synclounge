const compareTwoStrings = (first, second) => {
  const normalizedFirst = first.replace(/\s+/g, '');
  const normalizedSecond = second.replace(/\s+/g, '');

  if (normalizedFirst === normalizedSecond) {
    return 1;
  }

  if (normalizedFirst.length < 2 || normalizedSecond.length < 2) {
    return 0;
  }

  const firstBigrams = new Map();
  for (let index = 0; index < normalizedFirst.length - 1; index += 1) {
    const bigram = normalizedFirst.substring(index, index + 2);
    firstBigrams.set(bigram, (firstBigrams.get(bigram) || 0) + 1);
  }

  let intersectionSize = 0;
  for (let index = 0; index < normalizedSecond.length - 1; index += 1) {
    const bigram = normalizedSecond.substring(index, index + 2);
    const count = firstBigrams.get(bigram) || 0;
    if (count > 0) {
      firstBigrams.set(bigram, count - 1);
      intersectionSize += 1;
    }
  }

  return (2 * intersectionSize) / (normalizedFirst.length + normalizedSecond.length - 2);
};

export default compareTwoStrings;
