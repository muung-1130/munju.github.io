import { getPool } from '@/lib/db';

function toDateStr(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString().slice(0, 10);
}

// ---- 나에게 맞는 러닝화 찾기: 선호도 저장/조회 ----

export type UserShoePreferences = {
  cushionPreference: number | null;
  gripPreference: number | null;
  stabilityPreference: number | null;
  responsivenessPreference: number | null;
  distancePreference: number | null;
  footType: string | null;
  ankleStabilityNeed: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  updatedAt: string | null;
};

export async function getUserShoePreferences(userId: string): Promise<UserShoePreferences | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT cushion_preference, grip_preference, stability_preference, responsiveness_preference,
            distance_preference, foot_type, ankle_stability_need, budget_min, budget_max, updated_at
       FROM shoe.user_shoe_preferences WHERE user_id = $1`,
    [userId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    cushionPreference: row.cushion_preference,
    gripPreference: row.grip_preference,
    stabilityPreference: row.stability_preference,
    responsivenessPreference: row.responsiveness_preference,
    distancePreference: row.distance_preference,
    footType: row.foot_type,
    ankleStabilityNeed: row.ankle_stability_need,
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    updatedAt: row.updated_at
  };
}

export type SaveShoePreferencesInput = {
  cushionPreference: number;
  gripPreference: number;
  stabilityPreference: number;
  responsivenessPreference: number;
  distancePreference: number;
  footType: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
};

// "AI 추천 결과 보기" 버튼을 누를 때마다 지금 슬라이더/발볼/예산 상태를 그대로 덮어써서, 다음에
// 페이지를 다시 열어도 마지막으로 저장한 상태가 그대로 유지되게 한다(1인 1행, UPSERT).
export async function saveUserShoePreferences(userId: string, input: SaveShoePreferencesInput): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO shoe.user_shoe_preferences
       (user_id, cushion_preference, grip_preference, stability_preference, responsiveness_preference,
        distance_preference, foot_type, budget_min, budget_max)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id) DO UPDATE SET
       cushion_preference = EXCLUDED.cushion_preference,
       grip_preference = EXCLUDED.grip_preference,
       stability_preference = EXCLUDED.stability_preference,
       responsiveness_preference = EXCLUDED.responsiveness_preference,
       distance_preference = EXCLUDED.distance_preference,
       foot_type = EXCLUDED.foot_type,
       budget_min = EXCLUDED.budget_min,
       budget_max = EXCLUDED.budget_max,
       updated_at = now()`,
    [
      userId,
      input.cushionPreference,
      input.gripPreference,
      input.stabilityPreference,
      input.responsivenessPreference,
      input.distancePreference,
      input.footType,
      input.budgetMin,
      input.budgetMax
    ]
  );
}

// ---- 러닝화 카탈로그 + 찜 통계 ----

export type ShoeCatalogItem = {
  shoeId: number;
  shoeName: string;
  brandName: string;
  imageUrl: string;
  detailUrl: string;
  category: string;
  catalogScore: number;
  recommendLevel: string | null;
  purpose: string | null;
  footWidth: string | null;
  toeBox: string | null;
  cushioningValue: string | null;
  archSupport: string | null;
  weightG: number | null;
  dropMm: number | null;
  carbonPlate: boolean | null;
  price: number | null;
  currency: string | null;
  functionCodes: string[];
  likeCount: number;
  likedByUser: boolean;
};

export type ShoeCatalogPickerItem = { shoeId: number; shoeName: string; brandName: string; imageUrl: string };

// 러닝화 등록/수정 폼의 "모델 검색" 자동완성용 — 통계·찜 여부 없이 이름/브랜드만 가볍게 조회한다.
export async function searchShoeCatalogForPicker(query: string): Promise<ShoeCatalogPickerItem[]> {
  const pool = getPool();
  const trimmed = query.trim();
  if (!trimmed) {
    const { rows } = await pool.query(
      `SELECT shoe_id, shoe_name, brand_name, image_url FROM shoe.shoe_catalog ORDER BY score DESC LIMIT 20`
    );
    return rows.map((r) => ({ shoeId: Number(r.shoe_id), shoeName: r.shoe_name, brandName: r.brand_name, imageUrl: r.image_url }));
  }
  const { rows } = await pool.query(
    `SELECT shoe_id, shoe_name, brand_name, image_url FROM shoe.shoe_catalog
      WHERE shoe_name ILIKE $1 OR brand_name ILIKE $1
      ORDER BY score DESC LIMIT 20`,
    [`%${trimmed}%`]
  );
  return rows.map((r) => ({ shoeId: Number(r.shoe_id), shoeName: r.shoe_name, brandName: r.brand_name, imageUrl: r.image_url }));
}

export async function getAllShoesWithStats(userId: string | null): Promise<ShoeCatalogItem[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT sc.shoe_id, sc.shoe_name, sc.brand_name, sc.image_url, sc.detail_url, sc.category, sc.score,
            sp.recommend_level, sp.purpose, sp.foot_width, sp.toe_box, sp.cushioning_value, sp.arch_support,
            sp.weight_g, sp.drop_mm, sp.carbon_plate,
            pr.price, pr.currency,
            COALESCE(
              (SELECT array_agg(sf.function_code) FROM shoe.shoe_function_map sfm
                 JOIN shoe.shoe_function sf ON sf.function_id = sfm.function_id
                WHERE sfm.shoe_id = sc.shoe_id),
              '{}'
            ) AS function_codes,
            (SELECT COUNT(*) FROM shoe.shoe_likes sl WHERE sl.shoe_id = sc.shoe_id) AS like_count,
            EXISTS (SELECT 1 FROM shoe.shoe_likes sl2 WHERE sl2.shoe_id = sc.shoe_id AND sl2.user_id = $1) AS liked_by_user
       FROM shoe.shoe_catalog sc
       LEFT JOIN shoe.shoe_spec sp ON sp.shoe_id = sc.shoe_id
       LEFT JOIN LATERAL (
         SELECT price, currency FROM shoe.shoe_price p WHERE p.shoe_id = sc.shoe_id ORDER BY p.checked_date DESC LIMIT 1
       ) pr ON true
      ORDER BY sc.shoe_id
      LIMIT 200`,
    [userId]
  );
  return rows.map((row) => ({
    shoeId: Number(row.shoe_id),
    shoeName: row.shoe_name,
    brandName: row.brand_name,
    imageUrl: row.image_url,
    detailUrl: row.detail_url,
    category: row.category,
    catalogScore: Number(row.score),
    recommendLevel: row.recommend_level,
    purpose: row.purpose,
    footWidth: row.foot_width,
    toeBox: row.toe_box,
    cushioningValue: row.cushioning_value,
    archSupport: row.arch_support,
    weightG: row.weight_g,
    dropMm: row.drop_mm !== null ? Number(row.drop_mm) : null,
    carbonPlate: row.carbon_plate,
    price: row.price !== null ? Number(row.price) : null,
    currency: row.currency,
    functionCodes: row.function_codes ?? [],
    likeCount: Number(row.like_count),
    likedByUser: row.liked_by_user
  }));
}

export type ShoeSearchParams = {
  q?: string | null;
  brand?: string | null;
  purpose?: string | null;
  recommendLevel?: string | null;
  carbonPlate?: boolean | null;
  priceMin?: number | null;
  priceMax?: number | null;
  sort?: 'popular' | 'price_asc' | 'price_desc' | 'score';
  limit: number;
  offset: number;
};

const SORT_SQL: Record<NonNullable<ShoeSearchParams['sort']>, string> = {
  popular: 'like_count DESC, sc.score DESC',
  price_asc: 'pr.price ASC NULLS LAST',
  price_desc: 'pr.price DESC NULLS LAST',
  score: 'sc.score DESC'
};

// "더보기" 눌렀을 때 뜨는 전체 카탈로그 검색/필터/페이지네이션. shoe_catalog.brand_name,
// shoe_spec.purpose/recommend_level/carbon_plate, shoe_price.price에 이미 인덱스가 있어
// WHERE 조건으로 바로 걸어도 무리 없다.
export async function searchShoeCatalog(
  params: ShoeSearchParams,
  userId: string | null
): Promise<{ shoes: ShoeCatalogItem[]; total: number }> {
  const pool = getPool();
  const conditions: string[] = [];
  // COUNT 쿼리와 SELECT 쿼리가 공유하는 baseQuery(FROM/JOIN/WHERE)는 필터 조건 파라미터만 써야
  // 한다 — userId는 SELECT 쪽 liked_by_user 서브쿼리에서만 쓰이는데, 예전엔 이 배열 맨 앞에
  // userId를 넣어두고 COUNT 쿼리에도 그대로 넘겨서, 필터가 하나도 없을 때 "SQL엔 $1이 전혀
  // 없는데 파라미터는 1개 왔다"는 바인딩 에러가 났었다(전체 러닝화 검색이 아예 안 되던 원인).
  const values: unknown[] = [];

  function addCondition(sql: string, value: unknown) {
    values.push(value);
    conditions.push(sql.replace('$$', `$${values.length}`));
  }

  if (params.q) {
    // 이름/브랜드 OR 검색 — 같은 파라미터($n)를 두 군데서 재사용한다.
    values.push(`%${params.q}%`);
    conditions.push(`(sc.shoe_name ILIKE $${values.length} OR sc.brand_name ILIKE $${values.length})`);
  }
  if (params.brand) addCondition('sc.brand_name = $$', params.brand);
  if (params.purpose) addCondition('sp.purpose = $$', params.purpose);
  if (params.recommendLevel) addCondition('sp.recommend_level = $$', params.recommendLevel);
  if (params.carbonPlate !== null && params.carbonPlate !== undefined) addCondition('sp.carbon_plate = $$', params.carbonPlate);
  if (params.priceMin !== null && params.priceMin !== undefined) addCondition('pr.price >= $$', params.priceMin);
  if (params.priceMax !== null && params.priceMax !== undefined) addCondition('pr.price <= $$', params.priceMax);

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderSql = SORT_SQL[params.sort ?? 'popular'];

  const baseQuery = `
    FROM shoe.shoe_catalog sc
    LEFT JOIN shoe.shoe_spec sp ON sp.shoe_id = sc.shoe_id
    LEFT JOIN LATERAL (
      SELECT price, currency FROM shoe.shoe_price p WHERE p.shoe_id = sc.shoe_id ORDER BY p.checked_date DESC LIMIT 1
    ) pr ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS like_count FROM shoe.shoe_likes sl WHERE sl.shoe_id = sc.shoe_id
    ) lc ON true
    ${whereSql}`;

  const { rows: countRows } = await pool.query(`SELECT COUNT(*) AS total ${baseQuery}`, values);
  const total = Number(countRows[0].total);

  // userId/limit/offset은 필터 파라미터 뒤에 이어붙인다 — 필터 개수가 몇 개든 항상 정확한 번호로 참조된다.
  const userIdPlaceholder = values.length + 1;
  const limitPlaceholder = values.length + 2;
  const offsetPlaceholder = values.length + 3;
  const mainValues = [...values, userId, params.limit, params.offset];

  const { rows } = await pool.query(
    `SELECT sc.shoe_id, sc.shoe_name, sc.brand_name, sc.image_url, sc.detail_url, sc.category, sc.score,
            sp.recommend_level, sp.purpose, sp.foot_width, sp.toe_box, sp.cushioning_value, sp.arch_support,
            sp.weight_g, sp.drop_mm, sp.carbon_plate,
            pr.price, pr.currency,
            lc.like_count,
            COALESCE(
              (SELECT array_agg(sf.function_code) FROM shoe.shoe_function_map sfm
                 JOIN shoe.shoe_function sf ON sf.function_id = sfm.function_id
                WHERE sfm.shoe_id = sc.shoe_id),
              '{}'
            ) AS function_codes,
            EXISTS (SELECT 1 FROM shoe.shoe_likes sl2 WHERE sl2.shoe_id = sc.shoe_id AND sl2.user_id = $${userIdPlaceholder}) AS liked_by_user
       ${baseQuery}
      ORDER BY ${orderSql}
      LIMIT $${limitPlaceholder} OFFSET $${offsetPlaceholder}`,
    mainValues
  );

  const shoes = rows.map((row) => ({
    shoeId: Number(row.shoe_id),
    shoeName: row.shoe_name,
    brandName: row.brand_name,
    imageUrl: row.image_url,
    detailUrl: row.detail_url,
    category: row.category,
    catalogScore: Number(row.score),
    recommendLevel: row.recommend_level,
    purpose: row.purpose,
    footWidth: row.foot_width,
    toeBox: row.toe_box,
    cushioningValue: row.cushioning_value,
    archSupport: row.arch_support,
    weightG: row.weight_g,
    dropMm: row.drop_mm !== null ? Number(row.drop_mm) : null,
    carbonPlate: row.carbon_plate,
    price: row.price !== null ? Number(row.price) : null,
    currency: row.currency,
    functionCodes: row.function_codes ?? [],
    likeCount: Number(row.like_count ?? 0),
    likedByUser: row.liked_by_user
  }));

  return { shoes, total };
}

export type ShoeFilterOptions = {
  brands: string[];
  purposes: string[];
  recommendLevels: string[];
};

// 필터 바 옵션. purpose/recommendLevel은 DB에 이미 CHECK 없이 varchar지만 실제 값 종류가
// 적으므로(데일리/템포/레이싱, 초보/중급/고급) 매번 DISTINCT로 조회해 실데이터 기준으로만 보여준다
// — 스펙에 없는 값이 추가돼도 코드 수정 없이 자동 반영된다.
export async function getShoeFilterOptions(): Promise<ShoeFilterOptions> {
  const pool = getPool();
  const [brandRows, purposeRows, levelRows] = await Promise.all([
    pool.query(`SELECT DISTINCT brand_name FROM shoe.shoe_catalog ORDER BY brand_name`),
    pool.query(`SELECT DISTINCT purpose FROM shoe.shoe_spec WHERE purpose IS NOT NULL ORDER BY purpose`),
    pool.query(`SELECT DISTINCT recommend_level FROM shoe.shoe_spec WHERE recommend_level IS NOT NULL ORDER BY recommend_level`)
  ]);
  return {
    brands: brandRows.rows.map((r) => r.brand_name),
    purposes: purposeRows.rows.map((r) => r.purpose),
    recommendLevels: levelRows.rows.map((r) => r.recommend_level)
  };
}

// ---- 선호도 기반 매칭 점수 계산 ----
// 규칙 기반 점수 산정: 사용자가 실제로 입력한 항목만 비교 대상에 포함하고(입력 안 한 항목은
// 점수에 영향을 주지 않음), 각 항목은 0~5점, 최종 점수는 평균*20으로 0~100점 스케일로 맞춘다.
// 카탈로그에 없는 조합(예: 트레일 코스 전용 러닝화)은 데이터 자체가 없어 중립 처리한다.
const CUSHION_SCALE: Record<string, number> = { 펌: 1, 미디엄: 3, 소프트: 5 };
const STABILITY_SCALE: Record<string, number> = { 뉴트럴: 2, 스태빌리티: 5 };
const PURPOSE_DISTANCE_SCALE: Record<string, number> = { 레이싱: 2, 템포: 3, 데일리: 4 };
const FOOT_WIDTH_SCALE: Record<string, number> = { 좁음: 1, 보통: 3, 넓음: 5 };

type ScoreDimension = { label: string; score: number };

// 신발 가격이 예산 범위 안이면 만점, 벗어난 만큼(비율) 감점한다. 예산보다 싼 건 감점하지 않는다
// (돈을 아끼는 건 나쁜 매칭이 아님) — 예산 상한을 넘는 경우만 페널티를 준다.
function budgetScore(price: number, budgetMin: number | null, budgetMax: number | null): number {
  if (budgetMax !== null && price > budgetMax) {
    const overRatio = (price - budgetMax) / budgetMax;
    return Math.max(0, 5 - overRatio * 10);
  }
  if (budgetMin !== null && price < budgetMin) {
    return 4; // 예산보다 저렴한 것은 크게 감점하지 않는다.
  }
  return 5;
}

export function computeShoeMatchScore(
  prefs: UserShoePreferences | null,
  shoe: ShoeCatalogItem
): { score: number; reason: string } {
  const hasAnyPreference =
    prefs &&
    (prefs.cushionPreference !== null ||
      prefs.gripPreference !== null ||
      prefs.stabilityPreference !== null ||
      prefs.responsivenessPreference !== null ||
      prefs.distancePreference !== null ||
      prefs.footType !== null ||
      prefs.budgetMin !== null ||
      prefs.budgetMax !== null);

  if (!hasAnyPreference) {
    return { score: shoe.catalogScore, reason: '아직 선호도를 설정하지 않아 전체 평점이 높은 러닝화를 보여드려요.' };
  }

  const dims: ScoreDimension[] = [];

  if (prefs!.cushionPreference !== null && shoe.cushioningValue) {
    const shoeVal = CUSHION_SCALE[shoe.cushioningValue] ?? 3;
    dims.push({ label: '쿠션감', score: Math.max(0, 5 - Math.abs(prefs!.cushionPreference - shoeVal)) });
  }
  if (prefs!.stabilityPreference !== null && shoe.archSupport) {
    const shoeVal = STABILITY_SCALE[shoe.archSupport] ?? 3;
    dims.push({ label: '안정성', score: Math.max(0, 5 - Math.abs(prefs!.stabilityPreference - shoeVal)) });
  }
  if (prefs!.responsivenessPreference !== null) {
    const shoeVal = shoe.functionCodes.includes('energy_return') ? 5 : 2;
    dims.push({ label: '반발력', score: Math.max(0, 5 - Math.abs(prefs!.responsivenessPreference - shoeVal)) });
  }
  if (prefs!.gripPreference !== null) {
    const shoeVal = shoe.functionCodes.includes('grip') ? 5 : 2;
    dims.push({ label: '접지력', score: Math.max(0, 5 - Math.abs(prefs!.gripPreference - shoeVal)) });
  }
  if (prefs!.distancePreference !== null && shoe.purpose) {
    const shoeVal = PURPOSE_DISTANCE_SCALE[shoe.purpose] ?? 3;
    dims.push({ label: '주행 거리 적합도', score: Math.max(0, 5 - Math.abs(prefs!.distancePreference - shoeVal)) });
  }
  if (prefs!.footType !== null && shoe.footWidth) {
    const prefVal = FOOT_WIDTH_SCALE[prefs!.footType] ?? 3;
    const shoeVal = FOOT_WIDTH_SCALE[shoe.footWidth] ?? 3;
    dims.push({ label: '발볼', score: Math.max(0, 5 - Math.abs(prefVal - shoeVal)) });
  }
  if ((prefs!.budgetMin !== null || prefs!.budgetMax !== null) && shoe.price !== null) {
    dims.push({ label: '예산', score: budgetScore(shoe.price, prefs!.budgetMin, prefs!.budgetMax) });
  }

  if (dims.length === 0) {
    return { score: shoe.catalogScore, reason: '전체 평점이 높은 러닝화예요.' };
  }

  const avg = dims.reduce((sum, d) => sum + d.score, 0) / dims.length;
  const score = Math.round(avg * 20);

  const strongDims = dims.filter((d) => d.score >= 4).sort((a, b) => b.score - a.score).slice(0, 2);
  const reason = strongDims.length > 0 ? `${strongDims.map((d) => d.label).join(', ')}이(가) 선호와 잘 맞아요.` : '전반적으로 취향과 비슷한 러닝화예요.';

  return { score, reason };
}

export type RecommendedShoe = ShoeCatalogItem & { matchScore: number; reason: string };

export async function getRecommendedShoes(userId: string | null): Promise<RecommendedShoe[]> {
  const [prefs, shoes] = await Promise.all([userId ? getUserShoePreferences(userId) : Promise.resolve(null), getAllShoesWithStats(userId)]);

  // 예산(budgetMin/budgetMax)을 설정했으면 그 범위를 점수 가중치가 아니라 엄격한 필터로 적용한다
  // — 범위 밖 러닝화는 아무리 다른 조건이 잘 맞아도 추천에 절대 넣지 않는다. 그 결과 3개보다
  // 적게 남으면 남는 만큼만, 하나도 없으면 빈 배열을 돌려준다(화면에서 안내 문구 처리).
  const budgetFiltered =
    prefs && (prefs.budgetMin !== null || prefs.budgetMax !== null)
      ? shoes.filter(
          (shoe) =>
            shoe.price !== null &&
            (prefs.budgetMin === null || shoe.price >= prefs.budgetMin) &&
            (prefs.budgetMax === null || shoe.price <= prefs.budgetMax)
        )
      : shoes;

  return budgetFiltered
    .map((shoe) => {
      const { score, reason } = computeShoeMatchScore(prefs, shoe);
      return { ...shoe, matchScore: score, reason };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3);
}

// ---- 러닝화 찜(하트) ----

export async function getShoeLikeState(shoeId: number, userId: string | null) {
  const pool = getPool();
  const { rows: countRows } = await pool.query(`SELECT COUNT(*) AS like_count FROM shoe.shoe_likes WHERE shoe_id = $1`, [shoeId]);
  let likedByUser = false;
  if (userId) {
    const { rows } = await pool.query(`SELECT 1 FROM shoe.shoe_likes WHERE shoe_id = $1 AND user_id = $2`, [shoeId, userId]);
    likedByUser = rows.length > 0;
  }
  return { likeCount: Number(countRows[0].like_count), likedByUser };
}

export async function toggleShoeLike(shoeId: number, userId: string) {
  const pool = getPool();
  const { rows } = await pool.query(`DELETE FROM shoe.shoe_likes WHERE shoe_id = $1 AND user_id = $2 RETURNING *`, [shoeId, userId]);
  const liked = rows.length === 0;
  if (liked) {
    await pool.query(`INSERT INTO shoe.shoe_likes (shoe_id, user_id) VALUES ($1, $2) ON CONFLICT (shoe_id, user_id) DO NOTHING`, [
      shoeId,
      userId
    ]);
  }
  return getShoeLikeState(shoeId, userId);
}

export type LikedShoe = {
  shoeId: number;
  shoeName: string;
  brandName: string;
  imageUrl: string;
  detailUrl: string;
  price: number | null;
  currency: string | null;
  likedAt: string;
};

// 마이페이지 "찜한 러닝화" 섹션용.
export async function getUserLikedShoes(userId: string): Promise<LikedShoe[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT sc.shoe_id, sc.shoe_name, sc.brand_name, sc.image_url, sc.detail_url, pr.price, pr.currency, sl.created_at
       FROM shoe.shoe_likes sl
       JOIN shoe.shoe_catalog sc ON sc.shoe_id = sl.shoe_id
       LEFT JOIN LATERAL (
         SELECT price, currency FROM shoe.shoe_price p WHERE p.shoe_id = sc.shoe_id ORDER BY p.checked_date DESC LIMIT 1
       ) pr ON true
      WHERE sl.user_id = $1
      ORDER BY sl.created_at DESC`,
    [userId]
  );
  return rows.map((row) => ({
    shoeId: Number(row.shoe_id),
    shoeName: row.shoe_name,
    brandName: row.brand_name,
    imageUrl: row.image_url,
    detailUrl: row.detail_url,
    price: row.price !== null ? Number(row.price) : null,
    currency: row.currency,
    likedAt: row.created_at
  }));
}

export type ShoeLifeSnapshot = {
  estimatedRemainingDistanceM: number | null;
  estimatedRemainingDays: number | null;
  replacementRecommendedAt: string | null;
  replacementProbability: number | null;
  daysUntilReplacement: number | null; // 음수면 이미 지남
};

export type UserShoeDetail = {
  userShoeId: string;
  shoeName: string;
  brandName: string;
  imageUrl: string;
  category: string | null;
  weightG: number | null;
  dropMm: number | null;
  nickname: string | null;
  purchaseDate: string | null;
  firstUsedAt: string | null;
  initialDistanceM: number;
  accumulatedDistanceM: number;
  status: string;
  registeredAt: string;
  retiredAt: string | null;
  latestSnapshot: ShoeLifeSnapshot | null;
};

// 마이페이지 "보유 러닝화" 섹션용 — shoe.user_shoes에 shoe_catalog/shoe_spec 정보를 붙이고,
// 가장 최근 shoe_life_snapshots 한 건(교체 권장일 예측)을 같이 내려준다.
export async function getUserShoesDetailed(userId: string): Promise<UserShoeDetail[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT us.user_shoe_id, us.nickname, us.purchase_date, us.first_used_at, us.initial_distance_m,
            us.accumulated_distance_m, us.status, us.registered_at, us.retired_at,
            sc.shoe_name, sc.brand_name, sc.image_url, sc.category,
            sp.weight_g, sp.drop_mm,
            sls.estimated_remaining_distance_m, sls.estimated_remaining_days,
            sls.replacement_recommended_at, sls.replacement_probability
       FROM shoe.user_shoes us
       JOIN shoe.shoe_catalog sc ON sc.shoe_id = us.shoe_model_id
       LEFT JOIN shoe.shoe_spec sp ON sp.shoe_id = us.shoe_model_id
       LEFT JOIN LATERAL (
         SELECT * FROM shoe.shoe_life_snapshots s
          WHERE s.user_shoe_id = us.user_shoe_id
          ORDER BY s.created_at DESC LIMIT 1
       ) sls ON true
      WHERE us.user_id = $1
      ORDER BY us.status = 'ACTIVE' DESC, us.registered_at DESC`,
    [userId]
  );

  const todayKst = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const todayUtcMs = new Date(`${todayKst}T00:00:00Z`).getTime();

  return rows.map((row) => {
    const hasSnapshot = row.replacement_recommended_at !== null || row.estimated_remaining_distance_m !== null;
    let daysUntilReplacement: number | null = null;
    if (row.replacement_recommended_at) {
      const recAt = toDateStr(row.replacement_recommended_at);
      daysUntilReplacement = Math.round((new Date(`${recAt}T00:00:00Z`).getTime() - todayUtcMs) / 86_400_000);
    }
    return {
      userShoeId: row.user_shoe_id,
      shoeName: row.shoe_name,
      brandName: row.brand_name,
      imageUrl: row.image_url,
      category: row.category,
      weightG: row.weight_g,
      dropMm: row.drop_mm !== null ? Number(row.drop_mm) : null,
      nickname: row.nickname,
      purchaseDate: row.purchase_date ? toDateStr(row.purchase_date) : null,
      firstUsedAt: row.first_used_at ? toDateStr(row.first_used_at) : null,
      initialDistanceM: row.initial_distance_m,
      accumulatedDistanceM: row.accumulated_distance_m,
      status: row.status,
      registeredAt: row.registered_at,
      retiredAt: row.retired_at,
      latestSnapshot: hasSnapshot
        ? {
            estimatedRemainingDistanceM: row.estimated_remaining_distance_m,
            estimatedRemainingDays: row.estimated_remaining_days,
            replacementRecommendedAt: row.replacement_recommended_at ? toDateStr(row.replacement_recommended_at) : null,
            replacementProbability: row.replacement_probability !== null ? Number(row.replacement_probability) : null,
            daysUntilReplacement
          }
        : null
    };
  });
}

export type WearAnalysis = {
  wearAnalysisId: string;
  status: string;
  wearScore: number | null;
  heelWearScore: number | null;
  forefootWearScore: number | null;
  outsoleWearScore: number | null;
  requestedAt: string;
  completedAt: string | null;
};

// 신발 소유자 본인만 조회할 수 있게 userId로 소유권을 같이 검증한다.
export async function getShoeWearAnalyses(
  userShoeId: string,
  userId: string
): Promise<{ shoeName: string; purchaseDate: string | null; analyses: WearAnalysis[] } | null> {
  const pool = getPool();
  const { rows: shoeRows } = await pool.query(
    `SELECT sc.shoe_name, us.purchase_date FROM shoe.user_shoes us JOIN shoe.shoe_catalog sc ON sc.shoe_id = us.shoe_model_id
      WHERE us.user_shoe_id = $1 AND us.user_id = $2`,
    [userShoeId, userId]
  );
  if (shoeRows.length === 0) return null;

  const { rows } = await pool.query(
    `SELECT wear_analysis_id, status, wear_score, heel_wear_score, forefoot_wear_score, outsole_wear_score, requested_at, completed_at
       FROM shoe.shoe_wear_analyses WHERE user_shoe_id = $1 ORDER BY requested_at DESC`,
    [userShoeId]
  );
  return {
    shoeName: shoeRows[0].shoe_name,
    purchaseDate: shoeRows[0].purchase_date ? toDateStr(shoeRows[0].purchase_date) : null,
    analyses: rows.map((r) => ({
      wearAnalysisId: r.wear_analysis_id,
      status: r.status,
      wearScore: r.wear_score !== null ? Number(r.wear_score) : null,
      heelWearScore: r.heel_wear_score !== null ? Number(r.heel_wear_score) : null,
      forefootWearScore: r.forefoot_wear_score !== null ? Number(r.forefoot_wear_score) : null,
      outsoleWearScore: r.outsole_wear_score !== null ? Number(r.outsole_wear_score) : null,
      requestedAt: r.requested_at,
      completedAt: r.completed_at
    }))
  };
}
