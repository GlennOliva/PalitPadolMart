-- ============================================================================
-- PalitPaddleBai Mart - Development seed data.
--
-- Applies via `supabase db reset` (default seed path). Safe, non-sensitive
-- reference data only: marketplace categories and sample brands.
--
-- Sample listings are intentionally NOT seeded: they require authenticated
-- seller profiles (auth.users), which seed.sql must not fabricate. Create
-- sellers through the application flow, then add listings.
-- ============================================================================

insert into public.categories (name, slug, description, sort_order)
values
  ('Paddles', 'paddles', 'Pickleball paddles for players of every skill level', 10),
  ('Balls', 'balls', 'Indoor and outdoor pickleball balls', 20),
  ('Bags', 'bags', 'Pickleball bags, backpacks, and paddle cases', 30),
  ('Shoes', 'shoes', 'Court shoes designed for pickleball', 40),
  ('Apparel', 'apparel', 'Shirts, shorts, caps, and activewear', 50),
  ('Grips', 'grips', 'Replacement grips and overgrips', 60),
  ('Nets', 'nets', 'Portable and permanent pickleball nets', 70),
  ('Accessories', 'accessories', 'Paddle covers, ball hoppers, and more', 80),
  ('Training Equipment', 'training-equipment', 'Training aids, machines, and practice tools', 90),
  ('Other', 'other', 'Anything else pickleball-related', 100)
on conflict (slug) do nothing;

insert into public.brands (name, slug, description)
values
  ('Selkirk', 'selkirk', 'American paddle manufacturer known for performance paddles'),
  ('Joola', 'joola', 'German sports brand with a popular pro paddle line'),
  ('Paddletek', 'paddletek', 'Paddle maker focused on touch and control'),
  ('Franklin', 'franklin', 'Sports equipment brand with tournament balls'),
  ('Onix', 'onix', 'Pickleball brand known for balls and paddles'),
  ('Gamma', 'gamma', 'Racquet sport brand offering paddles and grips'),
  ('Engage', 'engage', 'Premium paddle brand with a pro player roster'),
  ('ProKennex', 'prokennex', 'Racquet sport brand with pickleball paddles'),
  ('Head', 'head', 'Global sports brand with pickleball paddles'),
  ('Vulcan', 'vulcan', 'Brand known for its flight pickleballs')
on conflict (slug) do nothing;
