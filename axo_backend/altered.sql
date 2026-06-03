-- =====================================================
-- MIGRATION: 002_create_po_revision_requests.sql
-- Description: Creates po_revision_requests table for tracking
--              revision requests between OEM and Supplier
-- PRD Section: Page 5 (Revision Request Workflow)
-- =====================================================

-- =====================================================
-- UP MIGRATION
-- =====================================================

-- Create po_revision_requests table
CREATE TABLE IF NOT EXISTS po_revision_requests (
    id                      SERIAL PRIMARY KEY,
    po_id                   INTEGER NOT NULL,
    requested_by            VARCHAR(50) NOT NULL,
    requested_by_id         INTEGER NOT NULL,
    changes                 JSONB NOT NULL DEFAULT '[]',
    reason                  TEXT NOT NULL,
    details                 TEXT,
    status                  VARCHAR(50) NOT NULL DEFAULT 'pending',
    response_notes          TEXT,
    responded_at            TIMESTAMP,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Foreign key constraint
    CONSTRAINT fk_po_revision_po_id FOREIGN KEY (po_id) 
        REFERENCES purchase_orders(id) ON DELETE CASCADE,
    
    -- Check constraints
    CONSTRAINT chk_po_revision_requested_by 
        CHECK (requested_by IN ('OEM', 'Supplier')),
    CONSTRAINT chk_po_revision_status 
        CHECK (status IN ('pending', 'accepted', 'rejected', 'countered', 'expired'))
);

-- Create indexes separately
CREATE INDEX IF NOT EXISTS idx_po_revision_po_id ON po_revision_requests(po_id);
CREATE INDEX IF NOT EXISTS idx_po_revision_status ON po_revision_requests(status);
CREATE INDEX IF NOT EXISTS idx_po_revision_requested_by ON po_revision_requests(requested_by, requested_by_id);
CREATE INDEX IF NOT EXISTS idx_po_revision_created_at ON po_revision_requests(created_at);

-- Add comments
COMMENT ON TABLE po_revision_requests IS 'Tracks revision requests between OEM and Supplier (PRD Page 5)';
COMMENT ON COLUMN po_revision_requests.changes IS 'JSON array of requested changes: [{field, old_value, new_value, reason}]';
COMMENT ON COLUMN po_revision_requests.status IS 'pending, accepted, rejected, countered, expired';

-- =====================================================
-- Create audit log for po_revision_requests
-- =====================================================

CREATE TABLE IF NOT EXISTS po_revision_requests_audit (
    id                      SERIAL PRIMARY KEY,
    revision_id             INTEGER NOT NULL,
    action                  VARCHAR(50) NOT NULL,
    old_status              VARCHAR(50),
    new_status              VARCHAR(50),
    changed_by              INTEGER,
    changed_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    notes                   TEXT,
    
    CONSTRAINT fk_revision_audit_revision_id FOREIGN KEY (revision_id)
        REFERENCES po_revision_requests(id) ON DELETE CASCADE
);

-- Create indexes for audit table
CREATE INDEX IF NOT EXISTS idx_revision_audit_revision_id ON po_revision_requests_audit(revision_id);
CREATE INDEX IF NOT EXISTS idx_revision_audit_changed_at ON po_revision_requests_audit(changed_at);

COMMENT ON TABLE po_revision_requests_audit IS 'Audit trail for revision request status changes';

-- =====================================================
-- Create trigger function for revision request audit
-- =====================================================

CREATE OR REPLACE FUNCTION audit_revision_request_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status != NEW.status THEN
            INSERT INTO po_revision_requests_audit (
                revision_id, action, old_status, new_status, changed_at
            ) VALUES (
                NEW.id, 'STATUS_CHANGE', OLD.status, NEW.status, NOW()
            );
        END IF;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO po_revision_requests_audit (
            revision_id, action, old_status, new_status, changed_at
        ) VALUES (
            NEW.id, 'CREATED', NULL, NEW.status, NOW()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to po_revision_requests
DROP TRIGGER IF EXISTS audit_revision_request ON po_revision_requests;
CREATE TRIGGER audit_revision_request
    AFTER INSERT OR UPDATE ON po_revision_requests
    FOR EACH ROW
    EXECUTE FUNCTION audit_revision_request_change();

-- =====================================================
-- Create function to auto-update updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_po_revision_requests_updated_at ON po_revision_requests;
CREATE TRIGGER update_po_revision_requests_updated_at
    BEFORE UPDATE ON po_revision_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

    -- =====================================================
-- MIGRATION: 003_update_purchase_orders.sql
-- Description: Adds missing columns to purchase_orders table
-- NOTE: Run only columns that don't exist yet
-- =====================================================

-- =====================================================
-- UP MIGRATION - Add only missing columns
-- =====================================================

-- Add signature columns (if not exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='supplier_signature') THEN
        ALTER TABLE purchase_orders ADD COLUMN supplier_signature JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='oem_signature') THEN
        ALTER TABLE purchase_orders ADD COLUMN oem_signature JSONB;
    END IF;
END $$;

-- Add signature timestamp columns (if not exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='signed_at') THEN
        ALTER TABLE purchase_orders ADD COLUMN signed_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='sent_at') THEN
        ALTER TABLE purchase_orders ADD COLUMN sent_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='accepted_at') THEN
        ALTER TABLE purchase_orders ADD COLUMN accepted_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='rejected_at') THEN
        ALTER TABLE purchase_orders ADD COLUMN rejected_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='revision_requested_at') THEN
        ALTER TABLE purchase_orders ADD COLUMN revision_requested_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='resent_at') THEN
        ALTER TABLE purchase_orders ADD COLUMN resent_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='resent_count') THEN
        ALTER TABLE purchase_orders ADD COLUMN resent_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add rejection/revision reason columns
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='rejection_reason') THEN
        ALTER TABLE purchase_orders ADD COLUMN rejection_reason TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='revision_reason') THEN
        ALTER TABLE purchase_orders ADD COLUMN revision_reason TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='supplier_notes') THEN
        ALTER TABLE purchase_orders ADD COLUMN supplier_notes TEXT;
    END IF;
END $$;

-- Add workflow_status column (if not exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='workflow_status') THEN
        ALTER TABLE purchase_orders ADD COLUMN workflow_status VARCHAR(50) DEFAULT 'draft';
    END IF;
END $$;

-- Add delivery date column (if not exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='delivery_date') THEN
        ALTER TABLE purchase_orders ADD COLUMN delivery_date DATE;
    END IF;
END $$;

-- Add progress percentage column (if not exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='progress') THEN
        ALTER TABLE purchase_orders ADD COLUMN progress INTEGER DEFAULT 0;
    END IF;
END $$;

-- Create indexes (if not exist)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_orders_workflow_status ON purchase_orders(workflow_status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_orders_sent_at ON purchase_orders(sent_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_orders_oem_id ON purchase_orders(oem_id);

-- =====================================================
-- MIGRATION: 003_update_purchase_orders.sql
-- Description: Adds missing columns to purchase_orders table
-- =====================================================

-- Add signature columns (if not exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='supplier_signature') THEN
        ALTER TABLE purchase_orders ADD COLUMN supplier_signature JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='oem_signature') THEN
        ALTER TABLE purchase_orders ADD COLUMN oem_signature JSONB;
    END IF;
END $$;

-- Add signature timestamp columns (if not exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='signed_at') THEN
        ALTER TABLE purchase_orders ADD COLUMN signed_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='sent_at') THEN
        ALTER TABLE purchase_orders ADD COLUMN sent_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='accepted_at') THEN
        ALTER TABLE purchase_orders ADD COLUMN accepted_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='rejected_at') THEN
        ALTER TABLE purchase_orders ADD COLUMN rejected_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='revision_requested_at') THEN
        ALTER TABLE purchase_orders ADD COLUMN revision_requested_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='resent_at') THEN
        ALTER TABLE purchase_orders ADD COLUMN resent_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='resent_count') THEN
        ALTER TABLE purchase_orders ADD COLUMN resent_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add rejection/revision reason columns
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='rejection_reason') THEN
        ALTER TABLE purchase_orders ADD COLUMN rejection_reason TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='revision_reason') THEN
        ALTER TABLE purchase_orders ADD COLUMN revision_reason TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='supplier_notes') THEN
        ALTER TABLE purchase_orders ADD COLUMN supplier_notes TEXT;
    END IF;
END $$;

-- Add workflow_status column (if not exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='workflow_status') THEN
        ALTER TABLE purchase_orders ADD COLUMN workflow_status VARCHAR(50) DEFAULT 'draft';
    END IF;
END $$;

-- Add delivery date column (if not exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='delivery_date') THEN
        ALTER TABLE purchase_orders ADD COLUMN delivery_date DATE;
    END IF;
END $$;

-- Add progress percentage column (if not exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='purchase_orders' AND column_name='progress') THEN
        ALTER TABLE purchase_orders ADD COLUMN progress INTEGER DEFAULT 0;
    END IF;
END $$;

-- Create indexes (without CONCURRENTLY - for migration scripts)
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_workflow_status ON purchase_orders(workflow_status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_sent_at ON purchase_orders(sent_at);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_oem_id ON purchase_orders(oem_id);


-- =====================================================
-- MIGRATION: 006_update_notifications.sql
-- Description: Enhances notifications table for email integration
-- =====================================================

-- Add missing columns (only if not exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='notifications' AND column_name='email_sent') THEN
        ALTER TABLE notifications ADD COLUMN email_sent BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='notifications' AND column_name='email_sent_at') THEN
        ALTER TABLE notifications ADD COLUMN email_sent_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='notifications' AND column_name='priority') THEN
        ALTER TABLE notifications ADD COLUMN priority VARCHAR(20) DEFAULT 'normal';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='notifications' AND column_name='expires_at') THEN
        ALTER TABLE notifications ADD COLUMN expires_at TIMESTAMP;
    END IF;
END $$;

-- Add check constraint for priority (only if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint 
                   WHERE conname = 'chk_notifications_priority') THEN
        ALTER TABLE notifications ADD CONSTRAINT chk_notifications_priority 
            CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
    END IF;
END $$;

-- Create indexes (without CONCURRENTLY)
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority);

-- Drop existing function if exists
DROP FUNCTION IF EXISTS delete_old_notifications();

-- Create function to delete old notifications
CREATE OR REPLACE FUNCTION delete_old_notifications()
RETURNS void AS $$
BEGIN
    DELETE FROM notifications 
    WHERE created_at < NOW() - INTERVAL '90 days'
    AND is_read = TRUE;
END;
$$ LANGUAGE plpgsql;