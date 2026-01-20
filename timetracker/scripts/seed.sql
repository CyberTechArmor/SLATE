-- Seed data for Slate
-- Note: Passwords are hashed versions of 'password123'
-- In production, use the install script to create the admin user

-- Insert demo user (password: admin)
-- Hash generated with bcrypt cost factor 12
INSERT INTO users (email, password_hash, name) VALUES
('admin@localhost', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewYpfQN.4MY4P0W.', 'Admin User')
ON CONFLICT (email) DO NOTHING;

-- Insert demo clients (password: client123)
INSERT INTO clients (name, contact_name, email, password_hash, phone, hourly_rate, status) VALUES
('Acme Corporation', 'John Smith', 'john@acme.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewYpfQN.4MY4P0W.', '555-0100', 150.00, 'active'),
('TechStart Inc', 'Sarah Johnson', 'sarah@techstart.io', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewYpfQN.4MY4P0W.', '555-0200', 125.00, 'active'),
('Global Services LLC', 'Mike Brown', 'mike@globalservices.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewYpfQN.4MY4P0W.', '555-0300', 175.00, 'active')
ON CONFLICT (email) DO NOTHING;

-- Insert demo projects
INSERT INTO projects (client_id, name, description, hourly_rate, status) VALUES
(1, 'Website Redesign', 'Complete redesign of corporate website', NULL, 'active'),
(1, 'API Development', 'Build REST API for mobile app', 175.00, 'active'),
(2, 'MVP Development', 'Initial product development', NULL, 'active'),
(2, 'DevOps Setup', 'Infrastructure and CI/CD pipeline', 150.00, 'completed'),
(3, 'Consulting', 'General technical consulting', NULL, 'active');

-- Insert demo time entries
INSERT INTO time_entries (client_id, project_id, date, start_time, duration, title, description, internal_notes, billable) VALUES
-- Acme Corporation entries
(1, 1, CURRENT_DATE - INTERVAL '1 day', '09:00', 2.5, 'Homepage wireframes', 'Created initial wireframes for the new homepage layout including hero section and feature highlights.', 'Client seemed hesitant about the bold colors. May need to present alternatives.', true),
(1, 1, CURRENT_DATE - INTERVAL '2 days', '10:30', 1.5, 'Design review meeting', 'Reviewed wireframes with stakeholders and gathered feedback.', 'John wants to add more CTAs. Schedule follow-up.', true),
(1, 2, CURRENT_DATE - INTERVAL '3 days', '14:00', 3.0, 'API endpoint design', 'Designed RESTful endpoints for user authentication and profile management.', NULL, true),
(1, NULL, CURRENT_DATE, '08:00', 0.5, 'Email correspondence', 'Responded to client questions about project timeline.', 'They are pushing for earlier delivery.', false),

-- TechStart Inc entries
(2, 3, CURRENT_DATE - INTERVAL '1 day', '13:00', 4.0, 'Core feature implementation', 'Implemented user registration and authentication flow with email verification.', 'Using their preferred auth provider. Had some issues with token refresh.', true),
(2, 3, CURRENT_DATE - INTERVAL '4 days', '09:00', 2.0, 'Database schema design', 'Designed and implemented PostgreSQL schema for core entities.', NULL, true),
(2, 4, CURRENT_DATE - INTERVAL '5 days', '11:00', 3.5, 'Docker setup', 'Created Docker Compose configuration for local development environment.', 'Completed and handed off', true),

-- Global Services LLC entries
(3, 5, CURRENT_DATE, '10:00', 1.5, 'Architecture consultation', 'Reviewed current architecture and provided recommendations for scaling.', 'They need to address the database bottleneck first.', true),
(3, NULL, CURRENT_DATE - INTERVAL '2 days', '15:00', 1.0, 'Security audit review', 'Reviewed third-party security audit findings and prioritized fixes.', 'Critical issues need immediate attention.', true);

-- Insert demo resources
INSERT INTO resources (time_entry_id, type, name, url) VALUES
(1, 'link', 'Figma Wireframes', 'https://figma.com/file/example123'),
(1, 'document', 'Requirements Doc', '/docs/homepage-requirements.pdf'),
(3, 'link', 'API Documentation', 'https://docs.example.com/api'),
(5, 'link', 'GitHub Repository', 'https://github.com/example/mvp'),
(7, 'document', 'Docker Guide', '/docs/docker-setup.md');

-- Insert demo invoice
INSERT INTO invoices (client_id, invoice_number, date_issued, date_due, subtotal, tax_rate, tax_amount, total, status, notes) VALUES
(2, '2024-0001', CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE, 687.50, 0, 0, 687.50, 'paid', 'Thank you for your business!');

-- Mark the invoiced time entry
UPDATE time_entries SET invoiced = true, invoice_id = 1 WHERE id = 7;
