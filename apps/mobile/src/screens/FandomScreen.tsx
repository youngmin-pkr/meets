/**
 * 팬덤 고르기 (최대 개수는 정책 값, 건너뛰기 가능, 공개는 기본 꺼짐)
 * '같은 팬을 먼저 보여 주세요'는 팬덤을 고르면 항상 켜진 것으로 봅니다. (사용자 결정)
 */
import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { api, type Me, type SignupConfig } from '../api';
import { colors } from '../theme';
import { Body, Card, ErrorText, Page, PrimaryButton, styles, TextButton, Title, TopBar } from '../ui';

type Fandom = { id: string; name: string };

export function FandomScreen(props: { config: SignupConfig; onBack: () => void; onDone: (me: Me) => void }) {
  const max = props.config.fandomMaxCount;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Fandom[]>([]);
  const [picked, setPicked] = useState<Fandom[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .searchFandoms(query)
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function toggle(f: Fandom) {
    setError(null);
    if (picked.some((p) => p.id === f.id)) {
      setPicked(picked.filter((p) => p.id !== f.id));
    } else if (picked.length >= max) {
      setError(`팬덤은 최대 ${max}개까지 고를 수 있어요.`);
    } else {
      setPicked([...picked, f]);
    }
  }

  async function save(ids: string[]) {
    setError(null);
    setLoading(true);
    try {
      props.onDone(await api.setFandoms(ids, ids.length > 0 && isPublic));
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page
      footer={
        <>
          <PrimaryButton label="다음" onPress={() => save(picked.map((p) => p.id))} loading={loading} />
          <TextButton label="건너뛸게요" onPress={() => save([])} />
        </>
      }
    >
      <TopBar label="가입 3/3" onBack={props.onBack} />
      <Title>누구를 좋아하세요?</Title>
      <Body>같은 팬을 먼저 만나고 싶을 때 쓰는 정보예요. 건너뛰어도 괜찮아요.</Body>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="아티스트, 작품, 전시 이름 검색"
        style={[styles.input, { borderWidth: 1.5, borderColor: colors.border }]}
      />

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '700' }}>{`고른 팬덤 (최대 ${max}개)`}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {picked.map((f) => (
            <Chip key={f.id} label={`${f.name} ✕`} selected onPress={() => toggle(f)} />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {results
          .filter((r) => !picked.some((p) => p.id === r.id))
          .map((f) => (
            <Chip key={f.id} label={f.name} onPress={() => toggle(f)} />
          ))}
      </View>

      <Card>
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 14, fontWeight: '700' }}>내 팬덤을 다른 사람에게 보여 주기</Text>
            <Text style={styles.small}>끄면 '같은 팬' 표시만 서로 보여요</Text>
          </View>
          <Switch value={isPublic} onValueChange={setIsPublic} accessibilityLabel="내 팬덤 공개" />
        </View>
      </Card>

      <ErrorText message={error} />
    </Page>
  );
}

function Chip(props: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      style={{
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 14,
        borderRadius: 22,
        backgroundColor: props.selected ? colors.ink : colors.white,
        borderWidth: props.selected ? 0 : 1.5,
        borderColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: props.selected ? '700' : '400', color: props.selected ? colors.lime : colors.ink }}>
        {props.label}
      </Text>
    </Pressable>
  );
}
