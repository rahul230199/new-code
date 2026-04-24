-- Create enum types
CREATE TYPE user_role AS ENUM ('OEM', 'SUPPLIER', 'BOTH');
CREATE TYPE user_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE field_type AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'OBJECT', 'ARRAY', 'EMAIL', 'URL', 'DATE', 'SELECT', 'MULTI_SELECT');

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    temp_password VARCHAR(255),
    is_temp_password BOOLEAN DEFAULT FALSE,
    role user_role NOT NULL,
    status user_status DEFAULT 'PENDING',
    company_name VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    website VARCHAR(500),
    capabilities TEXT[] DEFAULT '{}',
    custom_capabilities TEXT[] DEFAULT '{}',
    rejection_reason TEXT,
    last_login_at TIMESTAMP,
    password_changed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,
    rejected_at TIMESTAMP,
    
    INDEX idx_users_email (email),
    INDEX idx_users_status (status),
    INDEX idx_users_role (role),
    INDEX idx_users_created_at (created_at)
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
