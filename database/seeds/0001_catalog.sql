INSERT INTO aureum.amenities (code, name_en, name_zh_cn, category, icon_key)
VALUES
  ('air-conditioning', 'Air conditioning', '空调', 'comfort', 'snowflake'),
  ('city-view', 'City view', '城市景观', 'view', 'building-2'),
  ('full-kitchen', 'Full kitchen', '完整厨房', 'kitchen', 'cooking-pot'),
  ('infinity-pool', 'Infinity pool', '无边泳池', 'leisure', 'waves'),
  ('parking', 'Parking', '停车位', 'access', 'car'),
  ('private-courtyard', 'Private courtyard', '私人庭院', 'outdoor', 'trees'),
  ('sea-view', 'Sea view', '海景', 'view', 'sailboat'),
  ('washer-dryer', 'Washer and dryer', '洗衣机和烘干机', 'laundry', 'washing-machine'),
  ('wifi', 'High-speed Wi-Fi', '高速无线网络', 'connectivity', 'wifi')
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_zh_cn = EXCLUDED.name_zh_cn,
  category = EXCLUDED.category,
  icon_key = EXCLUDED.icon_key,
  is_active = true;

INSERT INTO aureum.properties (
  id,
  slug,
  name,
  tagline_en,
  description_en,
  property_type,
  status,
  city,
  state_region,
  rating_average,
  review_count,
  published_at
)
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    'the-opaline-residence',
    'The Opaline Residence',
    'Skyline calm in the heart of Kuala Lumpur.',
    'A light-filled high-rise residence shaped for unhurried city stays. Double-height living spaces, warm natural materials, and a private balcony frame uninterrupted skyline views.',
    'hotel',
    'published',
    'Kuala Lumpur',
    'Kuala Lumpur',
    4.94,
    128,
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'the-atlas-villa',
    'The Atlas Villa',
    'A private tropical horizon above the Andaman Sea.',
    'An indoor-outdoor hillside villa where deep teak, pale limestone, and tropical gardens meet the sea. Open pavilions and an infinity pool make room for slow, restorative days.',
    'airbnb',
    'published',
    'Langkawi',
    'Kedah',
    4.98,
    86,
    now()
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'the-terrace-house',
    'The Terrace House',
    'Heritage character, quietly reimagined in George Town.',
    'A restored terrace house that keeps its limewashed walls, timber shutters, and patterned tiles while introducing a calm contemporary rhythm around a planted inner courtyard.',
    'airbnb',
    'published',
    'Penang',
    'Penang',
    4.91,
    164,
    now()
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'the-elysian-suites',
    'The Elysian Suites',
    'Quiet, generous suites above Kuala Lumpur.',
    'A polished city hotel with intimate lounge spaces, panoramic windows and a considered arrival experience for short breaks or longer stays.',
    'hotel', 'published', 'Kuala Lumpur', 'Kuala Lumpur', 4.89, 73, now()
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    'the-tanjung-house',
    'The Tanjung House',
    'A sunlit heritage home near George Town.',
    'A calm, family-ready Penang house with restored detailing, a leafy courtyard and generous shared spaces for slow weekends together.',
    'airbnb', 'published', 'Penang', 'Penang', 4.96, 41, now()
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    'the-bay-pavilion',
    'The Bay Pavilion',
    'An ocean-facing hideaway in Langkawi.',
    'A small coastal hotel shaped around relaxed mornings, open-air dining and rooms that look towards the Andaman Sea.',
    'hotel', 'published', 'Langkawi', 'Kedah', 4.92, 57, now()
  )
ON CONFLICT (slug) WHERE deleted_at IS NULL DO UPDATE SET
  name = EXCLUDED.name,
  tagline_en = EXCLUDED.tagline_en,
  description_en = EXCLUDED.description_en,
  property_type = EXCLUDED.property_type,
  status = EXCLUDED.status,
  city = EXCLUDED.city,
  state_region = EXCLUDED.state_region,
  rating_average = EXCLUDED.rating_average,
  review_count = EXCLUDED.review_count,
  published_at = COALESCE(aureum.properties.published_at, EXCLUDED.published_at);

INSERT INTO aureum.property_images (
  id,
  property_id,
  image_url,
  alt_text_en,
  display_order,
  is_cover
)
SELECT
  gen_random_uuid(),
  property.id,
  image.image_url,
  image.alt_text,
  image.display_order,
  image.display_order = 0
FROM (
  VALUES
    ('the-opaline-residence', '/properties/the-opaline-residence-1.png', 'Double-height living room with Kuala Lumpur skyline', 0),
    ('the-opaline-residence', '/properties/the-opaline-residence-2.png', 'Dark-stone kitchen and dining room', 1),
    ('the-opaline-residence', '/properties/the-opaline-residence-3.png', 'Primary bedroom with city view', 2),
    ('the-opaline-residence', '/properties/the-opaline-residence-4.png', 'Private balcony at blue hour', 3),
    ('the-atlas-villa', '/properties/the-atlas-villa-1.png', 'Open-air living pavilion', 0),
    ('the-atlas-villa', '/properties/the-atlas-villa-2.png', 'Infinity pool overlooking the Andaman Sea', 1),
    ('the-atlas-villa', '/properties/the-atlas-villa-3.png', 'Primary bedroom opening to tropical greenery', 2),
    ('the-atlas-villa', '/properties/the-atlas-villa-4.png', 'Sheltered dining terrace at dusk', 3),
    ('the-terrace-house', '/properties/the-terrace-house-1.png', 'Courtyard living room', 0),
    ('the-terrace-house', '/properties/the-terrace-house-2.png', 'Patterned-tile kitchen and dining space', 1),
    ('the-terrace-house', '/properties/the-terrace-house-3.png', 'Bedroom with restored timber shutters', 2),
    ('the-terrace-house', '/properties/the-terrace-house-4.png', 'Planted inner courtyard at golden hour', 3),
    ('the-elysian-suites', '/properties/the-opaline-residence-1.png', 'Elysian lounge with city outlook', 0),
    ('the-elysian-suites', '/properties/the-opaline-residence-2.png', 'Elysian dining and cocktail lounge', 1),
    ('the-elysian-suites', '/properties/the-opaline-residence-3.png', 'Elysian suite bedroom', 2),
    ('the-elysian-suites', '/properties/the-opaline-residence-4.png', 'Elysian skyline balcony', 3),
    ('the-tanjung-house', '/properties/the-terrace-house-1.png', 'Tanjung House living room', 0),
    ('the-tanjung-house', '/properties/the-terrace-house-2.png', 'Tanjung House kitchen', 1),
    ('the-tanjung-house', '/properties/the-terrace-house-3.png', 'Tanjung House bedroom', 2),
    ('the-tanjung-house', '/properties/the-terrace-house-4.png', 'Tanjung House courtyard', 3),
    ('the-bay-pavilion', '/properties/the-atlas-villa-1.png', 'Bay Pavilion open-air lounge', 0),
    ('the-bay-pavilion', '/properties/the-atlas-villa-2.png', 'Bay Pavilion pool view', 1),
    ('the-bay-pavilion', '/properties/the-atlas-villa-3.png', 'Bay Pavilion king room', 2),
    ('the-bay-pavilion', '/properties/the-atlas-villa-4.png', 'Bay Pavilion dining terrace', 3)
) AS image(slug, image_url, alt_text, display_order)
JOIN aureum.properties AS property
  ON property.slug = image.slug
  AND property.deleted_at IS NULL
ON CONFLICT (property_id, display_order) DO UPDATE SET
  image_url = EXCLUDED.image_url,
  alt_text_en = EXCLUDED.alt_text_en,
  is_cover = EXCLUDED.is_cover;

INSERT INTO aureum.property_amenities (property_id, amenity_id)
SELECT property.id, amenity.id
FROM (
  VALUES
    ('the-opaline-residence', 'city-view'),
    ('the-opaline-residence', 'wifi'),
    ('the-opaline-residence', 'full-kitchen'),
    ('the-opaline-residence', 'air-conditioning'),
    ('the-opaline-residence', 'washer-dryer'),
    ('the-opaline-residence', 'parking'),
    ('the-atlas-villa', 'infinity-pool'),
    ('the-atlas-villa', 'sea-view'),
    ('the-atlas-villa', 'wifi'),
    ('the-atlas-villa', 'full-kitchen'),
    ('the-atlas-villa', 'air-conditioning'),
    ('the-atlas-villa', 'parking'),
    ('the-terrace-house', 'private-courtyard'),
    ('the-terrace-house', 'wifi'),
    ('the-terrace-house', 'full-kitchen'),
    ('the-terrace-house', 'air-conditioning'),
    ('the-terrace-house', 'washer-dryer'),
    ('the-terrace-house', 'parking'),
    ('the-elysian-suites', 'city-view'), ('the-elysian-suites', 'wifi'), ('the-elysian-suites', 'air-conditioning'), ('the-elysian-suites', 'parking'),
    ('the-tanjung-house', 'private-courtyard'), ('the-tanjung-house', 'wifi'), ('the-tanjung-house', 'full-kitchen'), ('the-tanjung-house', 'air-conditioning'), ('the-tanjung-house', 'washer-dryer'), ('the-tanjung-house', 'parking'),
    ('the-bay-pavilion', 'infinity-pool'), ('the-bay-pavilion', 'sea-view'), ('the-bay-pavilion', 'wifi'), ('the-bay-pavilion', 'air-conditioning'), ('the-bay-pavilion', 'parking')
) AS property_amenity(slug, amenity_code)
JOIN aureum.properties AS property
  ON property.slug = property_amenity.slug
  AND property.deleted_at IS NULL
JOIN aureum.amenities AS amenity
  ON amenity.code = property_amenity.amenity_code
ON CONFLICT (property_id, amenity_id) DO NOTHING;

INSERT INTO aureum.unit_types (
  property_id,
  code,
  public_name_en,
  description_en,
  max_adults,
  max_children,
  max_guests,
  bedrooms,
  beds,
  bathrooms,
  sort_order
)
SELECT
  property.id,
  room.code,
  room.public_name,
  room.description,
  room.max_adults,
  room.max_children,
  room.max_guests,
  room.bedrooms,
  room.beds,
  room.bathrooms,
  room.sort_order
FROM (
  VALUES
    ('the-opaline-residence', 'skyline-king', 'Skyline King Room', 'A refined king room with skyline views and space for two adults.', 2, 1, 3, 1, 1, 1.0, 0),
    ('the-opaline-residence', 'opaline-suite', 'Opaline Suite', 'A generous suite with a separate living area for families or longer stays.', 2, 4, 6, 2, 2, 2.0, 1),
    ('the-atlas-villa', 'entire-home', 'Entire Atlas Villa', 'Private use of the complete villa, pool, gardens, and four bedrooms.', 8, 4, 8, 4, 4, 4.0, 0),
    ('the-terrace-house', 'entire-home', 'Entire Terrace House', 'Private use of the restored home and planted inner courtyard.', 4, 2, 4, 2, 2, 2.0, 0),
    ('the-elysian-suites', 'elysian-king', 'Elysian King Room', 'A quiet king room with a generous city outlook.', 2, 1, 3, 1, 1, 1.0, 0),
    ('the-elysian-suites', 'elysian-suite', 'Elysian Corner Suite', 'A larger suite with separate lounge space for longer city stays.', 2, 2, 4, 1, 1, 1.0, 1),
    ('the-tanjung-house', 'entire-home', 'Entire Tanjung House', 'Private use of the full heritage house and courtyard.', 6, 2, 6, 3, 3, 2.0, 0),
    ('the-bay-pavilion', 'ocean-king', 'Ocean King Room', 'A relaxed king room with open-air coastal views.', 2, 1, 3, 1, 1, 1.0, 0)
) AS room(
  property_slug, code, public_name, description, max_adults,
  max_children, max_guests, bedrooms, beds, bathrooms, sort_order
)
JOIN aureum.properties AS property ON property.slug = room.property_slug
WHERE property.deleted_at IS NULL
ON CONFLICT (property_id, code) WHERE deleted_at IS NULL DO UPDATE SET
  public_name_en = EXCLUDED.public_name_en,
  description_en = EXCLUDED.description_en,
  max_adults = EXCLUDED.max_adults,
  max_children = EXCLUDED.max_children,
  max_guests = EXCLUDED.max_guests,
  bedrooms = EXCLUDED.bedrooms,
  beds = EXCLUDED.beds,
  bathrooms = EXCLUDED.bathrooms,
  sort_order = EXCLUDED.sort_order,
  is_active = true;

UPDATE aureum.units AS unit
SET
  unit_type_id = suite.id,
  internal_code = 'KL-301',
  internal_name = 'Room 301'
FROM aureum.unit_types AS current_type
JOIN aureum.properties AS property ON property.id = current_type.property_id
JOIN aureum.unit_types AS suite
  ON suite.property_id = property.id
  AND suite.code = 'opaline-suite'
  AND suite.deleted_at IS NULL
WHERE unit.unit_type_id = current_type.id
  AND property.slug = 'the-opaline-residence'
  AND current_type.code = 'skyline-king'
  AND unit.internal_code = 'KL-203'
  AND unit.deleted_at IS NULL;

INSERT INTO aureum.units (
  unit_type_id, internal_code, internal_name, status, floor_label
)
SELECT
  unit_type.id,
  room.internal_code,
  room.internal_name,
  'operational',
  room.floor_label
FROM (
  VALUES
    ('the-opaline-residence', 'skyline-king', 'KL-201', 'Room 201', '20'),
    ('the-opaline-residence', 'skyline-king', 'KL-202', 'Room 202', '20'),
    ('the-opaline-residence', 'opaline-suite', 'KL-301', 'Room 301', '30'),
    ('the-atlas-villa', 'entire-home', 'HOME-1', 'Atlas Villa internal unit', NULL),
    ('the-terrace-house', 'entire-home', 'HOME-1', 'Terrace House internal unit', NULL),
    ('the-elysian-suites', 'elysian-king', 'EL-201', 'Elysian Room 201', '20'),
    ('the-elysian-suites', 'elysian-king', 'EL-202', 'Elysian Room 202', '20'),
    ('the-elysian-suites', 'elysian-suite', 'EL-301', 'Elysian Suite 301', '30'),
    ('the-tanjung-house', 'entire-home', 'HOME-1', 'Tanjung House internal unit', NULL),
    ('the-bay-pavilion', 'ocean-king', 'BP-101', 'Bay Pavilion Room 101', '10'),
    ('the-bay-pavilion', 'ocean-king', 'BP-102', 'Bay Pavilion Room 102', '10')
) AS room(property_slug, unit_type_code, internal_code, internal_name, floor_label)
JOIN aureum.properties AS property ON property.slug = room.property_slug
JOIN aureum.unit_types AS unit_type
  ON unit_type.property_id = property.id
  AND unit_type.code = room.unit_type_code
  AND unit_type.deleted_at IS NULL
ON CONFLICT (unit_type_id, internal_code) WHERE deleted_at IS NULL DO UPDATE SET
  internal_name = EXCLUDED.internal_name,
  status = 'operational',
  floor_label = EXCLUDED.floor_label;

INSERT INTO aureum.rate_plans (
  unit_type_id,
  cancellation_policy_id,
  code,
  public_name_en,
  base_nightly_rate,
  currency,
  minimum_nights,
  is_default
)
SELECT
  unit_type.id,
  policy.id,
  'standard',
  'Standard rate',
  room.nightly_rate,
  'MYR',
  room.minimum_nights,
  true
FROM (
  VALUES
    ('the-opaline-residence', 'skyline-king', 980.00, 1),
    ('the-opaline-residence', 'opaline-suite', 1480.00, 1),
    ('the-atlas-villa', 'entire-home', 1480.00, 1),
    ('the-terrace-house', 'entire-home', 720.00, 1),
    ('the-elysian-suites', 'elysian-king', 760.00, 1),
    ('the-elysian-suites', 'elysian-suite', 1160.00, 1),
    ('the-tanjung-house', 'entire-home', 940.00, 2),
    ('the-bay-pavilion', 'ocean-king', 690.00, 1)
) AS room(property_slug, unit_type_code, nightly_rate, minimum_nights)
JOIN aureum.properties AS property ON property.slug = room.property_slug
JOIN aureum.unit_types AS unit_type
  ON unit_type.property_id = property.id
  AND unit_type.code = room.unit_type_code
  AND unit_type.deleted_at IS NULL
JOIN aureum.cancellation_policies AS policy ON policy.code = 'flexible'
ON CONFLICT (unit_type_id, code) WHERE deleted_at IS NULL DO UPDATE SET
  cancellation_policy_id = EXCLUDED.cancellation_policy_id,
  public_name_en = EXCLUDED.public_name_en,
  base_nightly_rate = EXCLUDED.base_nightly_rate,
  currency = EXCLUDED.currency,
  minimum_nights = EXCLUDED.minimum_nights,
  is_default = true,
  is_active = true;

INSERT INTO aureum.fee_rules (
  property_id, code, public_name_en, calculation, amount,
  is_mandatory, is_taxable, priority
)
SELECT
  property.id,
  fee.code,
  fee.public_name,
  fee.calculation::aureum.charge_calculation,
  fee.amount,
  true,
  fee.is_taxable,
  fee.priority
FROM (
  VALUES
    ('the-opaline-residence', 'cleaning-fee', 'Cleaning fee', 'fixed_per_stay', 180.00, false, 10),
    ('the-opaline-residence', 'service-fee', 'Service fee', 'percentage_of_accommodation', 8.00, false, 20),
    ('the-atlas-villa', 'cleaning-fee', 'Cleaning fee', 'fixed_per_stay', 260.00, false, 10),
    ('the-atlas-villa', 'service-fee', 'Service fee', 'percentage_of_accommodation', 8.00, false, 20),
    ('the-terrace-house', 'cleaning-fee', 'Cleaning fee', 'fixed_per_stay', 140.00, false, 10),
    ('the-terrace-house', 'service-fee', 'Service fee', 'percentage_of_accommodation', 8.00, false, 20),
    ('the-elysian-suites', 'service-fee', 'Service fee', 'percentage_of_accommodation', 8.00, false, 20),
    ('the-tanjung-house', 'cleaning-fee', 'Cleaning fee', 'fixed_per_stay', 190.00, false, 10),
    ('the-tanjung-house', 'service-fee', 'Service fee', 'percentage_of_accommodation', 8.00, false, 20),
    ('the-bay-pavilion', 'service-fee', 'Service fee', 'percentage_of_accommodation', 8.00, false, 20)
) AS fee(property_slug, code, public_name, calculation, amount, is_taxable, priority)
JOIN aureum.properties AS property ON property.slug = fee.property_slug
WHERE NOT EXISTS (
  SELECT 1
  FROM aureum.fee_rules AS existing
  WHERE existing.property_id = property.id
    AND existing.unit_type_id IS NULL
    AND existing.code = fee.code
    AND existing.deleted_at IS NULL
);

UPDATE aureum.fee_rules AS fee_rule
SET
  public_name_en = configured.public_name,
  calculation = configured.calculation::aureum.charge_calculation,
  amount = configured.amount,
  is_taxable = configured.is_taxable,
  priority = configured.priority,
  is_active = true
FROM (
  VALUES
    ('the-opaline-residence', 'cleaning-fee', 'Cleaning fee', 'fixed_per_stay', 180.00, false, 10),
    ('the-opaline-residence', 'service-fee', 'Service fee', 'percentage_of_accommodation', 8.00, false, 20),
    ('the-atlas-villa', 'cleaning-fee', 'Cleaning fee', 'fixed_per_stay', 260.00, false, 10),
    ('the-atlas-villa', 'service-fee', 'Service fee', 'percentage_of_accommodation', 8.00, false, 20),
    ('the-terrace-house', 'cleaning-fee', 'Cleaning fee', 'fixed_per_stay', 140.00, false, 10),
    ('the-terrace-house', 'service-fee', 'Service fee', 'percentage_of_accommodation', 8.00, false, 20),
    ('the-elysian-suites', 'service-fee', 'Service fee', 'percentage_of_accommodation', 8.00, false, 20),
    ('the-tanjung-house', 'cleaning-fee', 'Cleaning fee', 'fixed_per_stay', 190.00, false, 10),
    ('the-tanjung-house', 'service-fee', 'Service fee', 'percentage_of_accommodation', 8.00, false, 20),
    ('the-bay-pavilion', 'service-fee', 'Service fee', 'percentage_of_accommodation', 8.00, false, 20)
) AS configured(property_slug, code, public_name, calculation, amount, is_taxable, priority)
JOIN aureum.properties AS property ON property.slug = configured.property_slug
WHERE fee_rule.property_id = property.id
  AND fee_rule.unit_type_id IS NULL
  AND fee_rule.code = configured.code
  AND fee_rule.deleted_at IS NULL;

INSERT INTO aureum.tax_rules (
  property_id, code, public_name_en, calculation, amount,
  included_in_price, priority, is_active
)
SELECT
  property.id,
  'configured-lodging-tax',
  'Configured lodging tax',
  'percentage_of_accommodation',
  6.00,
  false,
  100,
  true
FROM aureum.properties AS property
WHERE property.status = 'published'
  AND property.deleted_at IS NULL
ON CONFLICT (property_id, code) WHERE deleted_at IS NULL DO UPDATE SET
  public_name_en = EXCLUDED.public_name_en,
  calculation = EXCLUDED.calculation,
  amount = EXCLUDED.amount,
  included_in_price = EXCLUDED.included_in_price,
  priority = EXCLUDED.priority,
  is_active = EXCLUDED.is_active;

INSERT INTO aureum.unit_blocks (
  unit_id, start_date, end_date, reason, note
)
SELECT
  unit.id,
  blocked.blocked_date,
  blocked.blocked_date + 1,
  'other',
  'Seeded demo room block'
FROM (
  VALUES
    ('the-opaline-residence', DATE '2026-08-08'),
    ('the-opaline-residence', DATE '2026-08-09'),
    ('the-opaline-residence', DATE '2026-08-17'),
    ('the-opaline-residence', DATE '2026-08-18'),
    ('the-opaline-residence', DATE '2026-08-28'),
    ('the-opaline-residence', DATE '2026-09-04'),
    ('the-opaline-residence', DATE '2026-09-05'),
    ('the-opaline-residence', DATE '2026-09-19'),
    ('the-atlas-villa', DATE '2026-08-11'),
    ('the-atlas-villa', DATE '2026-08-12'),
    ('the-atlas-villa', DATE '2026-08-13'),
    ('the-atlas-villa', DATE '2026-08-23'),
    ('the-atlas-villa', DATE '2026-08-24'),
    ('the-atlas-villa', DATE '2026-09-10'),
    ('the-atlas-villa', DATE '2026-09-11'),
    ('the-atlas-villa', DATE '2026-09-12'),
    ('the-terrace-house', DATE '2026-08-05'),
    ('the-terrace-house', DATE '2026-08-14'),
    ('the-terrace-house', DATE '2026-08-15'),
    ('the-terrace-house', DATE '2026-08-20'),
    ('the-terrace-house', DATE '2026-08-21'),
    ('the-terrace-house', DATE '2026-09-02'),
    ('the-terrace-house', DATE '2026-09-16'),
    ('the-terrace-house', DATE '2026-09-17')
) AS blocked(property_slug, blocked_date)
JOIN aureum.properties AS property ON property.slug = blocked.property_slug
JOIN aureum.unit_types AS unit_type
  ON unit_type.property_id = property.id
  AND unit_type.deleted_at IS NULL
JOIN aureum.units AS unit
  ON unit.unit_type_id = unit_type.id
  AND unit.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM aureum.unit_blocks AS existing
  WHERE existing.unit_id = unit.id
    AND existing.start_date = blocked.blocked_date
    AND existing.end_date = blocked.blocked_date + 1
    AND existing.deleted_at IS NULL
);
