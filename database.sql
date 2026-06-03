-- DATABASE SETUP FOR CYCLO
-- Run deze queries in de SQL Editor van je Supabase project om de database te configureren.

-- 1. Create a table for Public Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
  updated_at TIMESTAMP WITH TIME ZONE,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  rider_score INTEGER DEFAULT 100,
  
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
  INSERT INTO public.profiles (id, username, full_name, avatar_url, rider_score)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', 'rider_' || substring(new.id::text from 1 for 6)),
    COALESCE(new.raw_user_meta_data->>'full_name', 'Wielrenner'),
    COALESCE(
      new.raw_user_meta_data->>'avatar_url', 
      'https://api.dicebear.com/7.x/adventurer/svg?seed=' || new.id::text
    ),
    100
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

