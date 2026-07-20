import dotenv from 'dotenv';
import { Client } from '@elastic/elasticsearch';

import { getPool } from '../lib/db';

dotenv.config({
  path: '.env.local'
});

const node = process.env.ELASTICSEARCH_URL;
const username = process.env.ELASTICSEARCH_USERNAME;
const password = process.env.ELASTICSEARCH_PASSWORD;

if (!node || !username || !password) {
  throw new Error(
    '.env.local의 Elasticsearch 설정을 확인하세요.'
  );
}

const elasticsearch = new Client({
  node,

  auth: {
    username,
    password
  },

  tls: {
    rejectUnauthorized: false
  },

  requestTimeout: 30_000,
  maxRetries: 3
});

function toDate(
  value: string | Date | null
): string | null {
  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
}

function parseDistanceKm(
  raceDistance: string | null
): number | null {
  if (!raceDistance) {
    return null;
  }

  const value = raceDistance.trim().toLowerCase();

  if (value === '풀') {
    return 42.195;
  }

  if (value === '하프') {
    return 21.0975;
  }

  const match = value.match(
    /^([0-9]+(?:\.[0-9]+)?)km$/
  );

  return match ? Number(match[1]) : null;
}

type IndexDocument = {
  id: string;
  document: Record<string, unknown>;
};

async function bulkIndex(
  index: string,
  documents: IndexDocument[]
) {
  if (documents.length === 0) {
    console.log(`${index}: 적재할 데이터 없음`);
    return;
  }

  const operations = documents.flatMap(
    ({ id, document }) => [
      {
        index: {
          _index: index,
          _id: id
        }
      },
      document
    ]
  );

  const response = await elasticsearch.bulk({
    refresh: true,
    operations
  });

  if (response.errors) {
    const failures = response.items
      .filter((item) => {
        const result =
          item.index ??
          item.create ??
          item.update ??
          item.delete;

        return Boolean(result?.error);
      })
      .slice(0, 10);

    console.error(
      `${index} 적재 오류:`,
      JSON.stringify(failures, null, 2)
    );

    throw new Error(
      `${index} 인덱스 적재 중 오류가 발생했습니다.`
    );
  }

  console.log(
    `${index}: ${documents.length}건 적재 완료`
  );
}

async function syncMarathons() {
  const pool = getPool();

  const { rows } = await pool.query(`
    SELECT
      race_id,
      race_name,
      race_date,
      registration_start_date,
      registration_end_date,
      souvenir,
      race_distance,
      region,
      official_website
    FROM marathon.marathon_race
  `);

  const documents: IndexDocument[] = rows.map(
    (row) => ({
      id: String(row.race_id),

      document: {
        raceId: Number(row.race_id),
        raceName: row.race_name,
        raceDate: toDate(row.race_date),
        registrationStartDate: toDate(
          row.registration_start_date
        ),
        registrationEndDate: toDate(
          row.registration_end_date
        ),
        souvenir: row.souvenir,
        raceDistance: row.race_distance,
        distanceKm: parseDistanceKm(
          row.race_distance
        ),
        region: row.region,
        officialWebsite: row.official_website
      }
    })
  );

  await bulkIndex('marathons', documents);
}

async function syncCourses() {
  const pool = getPool();

  const { rows } = await pool.query(`
    SELECT
      course_id,
      course_name,
      description,
      region,
      difficulty,
      distance_m,
      visibility,
      status
    FROM course.courses
    WHERE deleted_at IS NULL
  `);

  const documents: IndexDocument[] = rows.map(
    (row) => ({
      id: String(row.course_id),

      document: {
        courseId: String(row.course_id),
        name: row.course_name,
        description: row.description,
        region: row.region,
        difficulty:
          row.difficulty !== null
            ? Number(row.difficulty)
            : null,
        distanceM:
          row.distance_m !== null
            ? Number(row.distance_m)
            : null,
        visibility: row.visibility,
        status: row.status
      }
    })
  );

  await bulkIndex('courses', documents);
}

async function syncRunningShoes() {
  const pool = getPool();

  const { rows } = await pool.query(`
    SELECT
      sc.shoe_id,
      sc.shoe_name,
      sc.brand_name,
      sc.image_url,
      sc.detail_url,
      sc.category,
      sc.score,
      sp.recommend_level,
      sp.purpose,
      sp.foot_width,
      sp.toe_box,
      sp.cushioning_value,
      sp.arch_support,
      sp.weight_g,
      sp.drop_mm,
      sp.carbon_plate,
      pr.price,
      pr.currency,
      COALESCE(
        (
          SELECT array_agg(sf.function_code)
          FROM shoe.shoe_function_map sfm
          JOIN shoe.shoe_function sf
            ON sf.function_id = sfm.function_id
          WHERE sfm.shoe_id = sc.shoe_id
        ),
        '{}'
      ) AS function_codes
    FROM shoe.shoe_catalog sc
    LEFT JOIN shoe.shoe_spec sp
      ON sp.shoe_id = sc.shoe_id
    LEFT JOIN LATERAL (
      SELECT
        price,
        currency
      FROM shoe.shoe_price p
      WHERE p.shoe_id = sc.shoe_id
      ORDER BY p.checked_date DESC
      LIMIT 1
    ) pr ON true
  `);

  const documents: IndexDocument[] = rows.map(
    (row) => ({
      id: String(row.shoe_id),

      document: {
        shoeId: Number(row.shoe_id),
        shoeName: row.shoe_name,
        brandName: row.brand_name,
        imageUrl: row.image_url,
        detailUrl: row.detail_url,
        category: row.category,
        catalogScore:
          row.score !== null
            ? Number(row.score)
            : 0,
        recommendLevel: row.recommend_level,
        purpose: row.purpose,
        footWidth: row.foot_width,
        toeBox: row.toe_box,
        cushioningValue: row.cushioning_value,
        archSupport: row.arch_support,
        weightG:
          row.weight_g !== null
            ? Number(row.weight_g)
            : null,
        dropMm:
          row.drop_mm !== null
            ? Number(row.drop_mm)
            : null,
        carbonPlate: row.carbon_plate,
        price:
          row.price !== null
            ? Number(row.price)
            : null,
        currency: row.currency,
        functionCodes: row.function_codes ?? []
      }
    })
  );

  await bulkIndex('running_shoes', documents);
}

async function main() {
  const pool = getPool();

  try {
    const info = await elasticsearch.info();

    console.log(
      `Elasticsearch 연결: ${info.cluster_name} ${info.version.number}`
    );

    await syncMarathons();
    await syncCourses();
    await syncRunningShoes();

    console.log('전체 초기 동기화 완료');
  } catch (error) {
    console.error('동기화 실패:', error);
    process.exitCode = 1;
  } finally {
    await elasticsearch.close();
    await pool.end();
  }
}

main();
