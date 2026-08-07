import compareTwoStrings from '../../../utils/compareTwoStrings';

// Higher is closer
const scoreMedia = (result, hostTimeline) => {
  const titleScore = compareTwoStrings(hostTimeline.title, result.title);

  const parentTitleScore = (hostTimeline.parentTitle && result.parentTitle)
    ? compareTwoStrings(hostTimeline.parentTitle, result.parentTitle)
    : 0;

  const grandparentTitleScore = (hostTimeline.grandparentTitle && result.grandparentTitle)
    ? compareTwoStrings(hostTimeline.grandparentTitle, result.grandparentTitle)
    : 0;

  const typeScore = hostTimeline.type === result.type ? 1 : 0;

  return titleScore + parentTitleScore + grandparentTitleScore + typeScore;
};

export default scoreMedia;
