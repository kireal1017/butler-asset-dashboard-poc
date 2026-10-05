const LIST_URL = 'https://apis.data.go.kr/1613000/AptListService4/getSidoAptList4';
const BASIS_URL = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5';
const DETAIL_URL = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusDtlInfoV5';

export const SEOUL_SIDO_CODE = '11';

export async function fetchSidoComplexes(api, sidoCode = SEOUL_SIDO_CODE) {
  const body = JSON.parse(await api.request('aptList', LIST_URL, { sidoCode, numOfRows: '4000', pageNo: '1' }));
  const { items, totalCount } = body.response.body;
  return { items: [].concat(items || []), totalCount: Number(totalCount) };
}

export async function fetchComplexBasis(api, kaptCode) {
  const body = JSON.parse(await api.request('aptBasis', BASIS_URL, { kaptCode }, { keyParam: 'ServiceKey' }));
  return body.response.body.item;
}

export async function fetchComplexDetail(api, kaptCode) {
  const body = JSON.parse(await api.request('aptBasis', DETAIL_URL, { kaptCode }, { keyParam: 'ServiceKey' }));
  return body.response.body.item;
}
