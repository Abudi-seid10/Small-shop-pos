-- Create First Admin User
-- Run this after you have signed up through the application

-- Step 1: Find your user ID by running this query in Supabase SQL Editor
-- Replace 'your-email@example.com' with the email you used to sign up
SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';

-- Step 2: Verify your role was inserted correctly
-- Replace 'your-email@example.com' with your email
SELECT ur.*, au.email 
FROM user_roles ur 
JOIN auth.users au ON ur.auth_id = au.id 
WHERE au.email = 'your-email@example.com';

-- Step 3: If no role exists, insert it
-- Replace 'YOUR_USER_ID_HERE' with the actual UUID from step 1
-- Replace 'Admin Name' with your actual name
-- Replace '+1234567890' with your phone number (optional)

INSERT INTO user_roles (auth_id, role, full_name, phone, is_active) VALUES
('YOUR_USER_ID_HERE', 'admin', 'Admin Name', '+1234567890', true);

-- Step 4: Verify the insertion
SELECT ur.*, au.email 
FROM user_roles ur 
JOIN auth.users au ON ur.auth_id = au.id 
WHERE au.email = 'your-email@example.com';
