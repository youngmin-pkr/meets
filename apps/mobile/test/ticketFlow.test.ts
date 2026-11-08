import { rectFromDrag, toPickedImage } from '../src/ticketFlow';

describe('끌어서 가릴 영역 만들기', () => {
  const size = { width: 200, height: 100 };

  test('끈 영역을 이미지 크기에 대한 비율로 바꾼다', () => {
    expect(rectFromDrag({ x: 20, y: 10 }, { x: 120, y: 60 }, size)).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
  });

  test('거꾸로 끌어도 같은 영역', () => {
    expect(rectFromDrag({ x: 120, y: 60 }, { x: 20, y: 10 }, size)).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
  });

  test('이미지 밖으로 끌면 이미지 안으로 자른다', () => {
    expect(rectFromDrag({ x: 150, y: 50 }, { x: 400, y: 300 }, size)).toEqual({ x: 0.75, y: 0.5, w: 0.25, h: 0.5 });
  });

  test('톡 친 정도의 아주 작은 영역은 무시한다', () => {
    expect(rectFromDrag({ x: 10, y: 10 }, { x: 11, y: 11 }, size)).toBeNull();
  });
});

describe('고른 사진에서 데이터 꺼내기', () => {
  test('휴대폰: base64와 형식을 그대로 쓴다', () => {
    expect(toPickedImage({ uri: 'file://a.jpg', width: 10, height: 20, base64: 'AAA', mimeType: 'image/jpeg' })).toMatchObject({
      base64: 'AAA',
      mimeType: 'image/jpeg',
    });
  });

  test('웹: data: 주소에서 꺼낸다', () => {
    expect(toPickedImage({ uri: 'data:image/png;base64,BBB', width: 1, height: 1 })).toMatchObject({ base64: 'BBB', mimeType: 'image/png' });
  });

  test('데이터가 없으면 null', () => {
    expect(toPickedImage({ uri: 'file://a.jpg', width: 1, height: 1 })).toBeNull();
  });
});
