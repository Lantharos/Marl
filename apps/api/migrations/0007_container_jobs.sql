ALTER TABLE jobs ADD COLUMN runtime_json TEXT NOT NULL DEFAULT '{"image":"ubuntu:24.04","timeoutMinutes":360,"services":[]}';
ALTER TABLE jobs ADD COLUMN needs_json TEXT NOT NULL DEFAULT '[]';
