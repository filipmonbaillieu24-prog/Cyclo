-- DATABASE SETUP FOR CYCLO
-- Run deze queries in de SQL Editor van je Supabase project om de database te configureren.
-- Bij een bestaande database: gebruik de ALTER TABLE statements onderaan (sectie 8).

-- 1. Create a table for Public Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
  updated_at TIMESTAMP WITH TIME ZONE,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  rider_score INTEGER DEFAULT 100,
  bike_type TEXT DEFAULT 'Road',
  gender TEXT CHECK (gender IN ('Male', 'Female', 'Other')),
  birthdate DATE,
  height INTEGER,
  weight NUMERIC(5,1),

  -- Persoonlijke records (automatisch bijgehouden)
  pr_distance_km NUMERIC(7,2),
  pr_speed_kmh NUMERIC(5,2),
  pr_ascent_m INTEGER,
  pr_wkg NUMERIC(4,2),

  CONSTRAINT username_length CHECK (char_length(username) >= 3)
);

-- Enable RLS for Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to profiles" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Allow users to update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Trigger to automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, avatar_url, rider_score, bike_type)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', 'rider_' || substring(new.id::text from 1 for 6)),
    COALESCE(new.raw_user_meta_data->>'full_name', 'Wielrenner'),
    COALESCE(
      new.raw_user_meta_data->>'avatar_url', 
      'https://api.dicebear.com/7.x/adventurer/svg?seed=' || new.id::text
    ),
    100,
    COALESCE(new.raw_user_meta_data->>'bike_type', 'Road')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. Create a table for Availabilities
CREATE TABLE IF NOT EXISTS public.availabilities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'tentative', 'unavailable')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  CONSTRAINT unique_user_date UNIQUE (user_id, date)
);

-- Enable RLS for Availabilities
ALTER TABLE public.availabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read all availabilities" ON public.availabilities
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow users to insert their own availability" ON public.availabilities
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to update their own availability" ON public.availabilities
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Allow users to delete their own availability" ON public.availabilities
  FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- 3. Create a table for Rides (Groepsritten)
CREATE TABLE IF NOT EXISTS public.rides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  route_link TEXT,
  activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL,
  expected_distance_km NUMERIC(6,1),
  expected_speed_kmh NUMERIC(4,1),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for Rides
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read all rides" ON public.rides
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow users to create rides" ON public.rides
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Allow creator to update their rides" ON public.rides
  FOR UPDATE TO authenticated USING (auth.uid() = created_by);

CREATE POLICY "Allow creator to delete their rides" ON public.rides
  FOR DELETE TO authenticated USING (auth.uid() = created_by);


-- 4. Create a table for Ride Participants
CREATE TABLE IF NOT EXISTS public.ride_participants (
  ride_id UUID REFERENCES public.rides(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  PRIMARY KEY (ride_id, user_id)
);

-- Enable RLS for Ride Participants
ALTER TABLE public.ride_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read participants" ON public.ride_participants
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow users to join a ride" ON public.ride_participants
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to leave a ride" ON public.ride_participants
  FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- 5. Helper Views & Functions for Easy Dashboard Loading
-- Een handige view om profielen met hun actieve beschikbaarheid te koppelen
CREATE OR REPLACE VIEW public.vw_user_availabilities AS
SELECT 
  a.id AS availability_id,
  a.date,
  a.status,
  a.notes,
  p.id AS user_id,
  p.username,
  p.full_name,
  p.avatar_url,
  p.rider_score
FROM public.availabilities a
JOIN public.profiles p ON a.user_id = p.id;


-- 6. Create a table for Activities (Geüploade Ritten)
CREATE TABLE IF NOT EXISTS public.activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  distance_km NUMERIC NOT NULL,
  duration_secs NUMERIC NOT NULL,
  ascent_m INTEGER NOT NULL,
  avg_speed_kmh NUMERIC NOT NULL,
  avg_heart_rate INTEGER,
  avg_power_watts INTEGER,
  rider_score INTEGER NOT NULL,
  coordinates JSONB, -- Array of [{lat, lng, alt}]
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for Activities
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read all activities" ON public.activities
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow users to insert their own activities" ON public.activities
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to delete their own activities" ON public.activities
  FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- 7. Create a table for Activity Feed (Clubactiviteitenfeed)
CREATE TABLE IF NOT EXISTS public.activity_feed (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('uploaded_activity', 'joined_ride', 'left_ride', 'new_pr')),
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for Activity Feed
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read feed" ON public.activity_feed
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow users to insert their own feed entries" ON public.activity_feed
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to delete their own feed entries" ON public.activity_feed
  FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- =============================================================
-- 8. MIGRATIE: ALTER TABLE statements voor bestaande databases
-- Voer deze uit als je al een bestaande Cyclo-database hebt.
-- =============================================================

-- Profiles: nieuwe kolommen toevoegen
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS bike_type TEXT DEFAULT 'Road',
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('Male', 'Female', 'Other')),
  ADD COLUMN IF NOT EXISTS birthdate DATE,
  ADD COLUMN IF NOT EXISTS height INTEGER,
  ADD COLUMN IF NOT EXISTS weight NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS pr_distance_km NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS pr_speed_kmh NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS pr_ascent_m INTEGER,
  ADD COLUMN IF NOT EXISTS pr_wkg NUMERIC(4,2);

-- Rides: verwachte afstand en tempo toevoegen
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expected_distance_km NUMERIC(6,1),
  ADD COLUMN IF NOT EXISTS expected_speed_kmh NUMERIC(4,1);

-- 9. Create a table for API Integrations (Strava & Garmin)
CREATE TABLE IF NOT EXISTS public.user_integrations (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL PRIMARY KEY,
  strava_connected BOOLEAN DEFAULT false NOT NULL,
  strava_access_token TEXT,
  strava_refresh_token TEXT,
  strava_expires_at TIMESTAMP WITH TIME ZONE,
  strava_athlete_id TEXT,
  
  garmin_connected BOOLEAN DEFAULT false NOT NULL,
  garmin_access_token TEXT,
  garmin_refresh_token TEXT,
  garmin_expires_at TIMESTAMP WITH TIME ZONE,
  garmin_user_id TEXT,

  wahoo_connected BOOLEAN DEFAULT false NOT NULL,
  wahoo_access_token TEXT,
  wahoo_refresh_token TEXT,
  wahoo_expires_at TIMESTAMP WITH TIME ZONE,
  wahoo_user_id TEXT,
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to read their own integrations" ON public.user_integrations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Allow users to upsert their own integrations" ON public.user_integrations
  FOR ALL TO authenticated USING (auth.uid() = user_id);


-- 10. Table for Daily Biometrics (HRV, resting heart rate)
CREATE TABLE IF NOT EXISTS public.daily_biometrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  hrv_rmssd INTEGER NOT NULL,
  resting_heart_rate INTEGER NOT NULL,
  readiness_score INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  CONSTRAINT unique_user_biometric_date UNIQUE (user_id, date)
);

-- Enable RLS for Daily Biometrics
ALTER TABLE public.daily_biometrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to read their own biometrics" ON public.daily_biometrics
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Allow users to insert their own biometrics" ON public.daily_biometrics
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to update their own biometrics" ON public.daily_biometrics
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Allow users to delete their own biometrics" ON public.daily_biometrics
  FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- 11. Table for Equipment and Component Wear Tracking
CREATE TABLE IF NOT EXISTS public.equipment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'road' NOT NULL,
  service_interval_km NUMERIC DEFAULT 5000 NOT NULL,
  purchase_date DATE,
  notes TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  is_default BOOLEAN DEFAULT false NOT NULL,
  total_km NUMERIC DEFAULT 0 NOT NULL,
  last_service_km NUMERIC DEFAULT 0 NOT NULL,
  chain_wear_km NUMERIC DEFAULT 0 NOT NULL,
  brakepads_wear_km NUMERIC DEFAULT 0 NOT NULL,
  sealant_last_replaced DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read all equipment" ON public.equipment
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow users to insert their own equipment" ON public.equipment
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to update their own equipment" ON public.equipment
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Allow users to delete their own equipment" ON public.equipment
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
