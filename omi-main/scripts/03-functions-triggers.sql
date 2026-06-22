-- Create function to auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, pin_hash, referral_code)
  VALUES (
    new.id,
    new.email,
    new.user_metadata->>'pin_hash' OR '',
    'REF_' || substr(new.id::text, 1, 8) || '_' || to_char(NOW(), 'YYYYMMDDHH24MI')
  );
  
  INSERT INTO public.user_stats (user_id, current_tier)
  VALUES (new.id, 'bronze');
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Create function to update user stats on task completion
CREATE OR REPLACE FUNCTION update_user_stats_on_task_completion()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    UPDATE user_stats
    SET total_tasks_completed = total_tasks_completed + 1,
        total_earnings = (SELECT COALESCE(SUM(payout_amount), 0) FROM tasks WHERE id IN (
          SELECT task_id FROM task_assignments WHERE user_id = NEW.user_id AND status = 'approved'
        )),
        last_updated = NOW()
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for task completion stats
CREATE TRIGGER on_task_assignment_completed
  AFTER UPDATE ON task_assignments
  FOR EACH ROW EXECUTE PROCEDURE update_user_stats_on_task_completion();

-- Create function to handle tier upgrades
CREATE OR REPLACE FUNCTION check_tier_upgrade()
RETURNS trigger AS $$
DECLARE
  new_tier TEXT;
BEGIN
  SELECT CASE
    WHEN NEW.total_earnings >= 5000 THEN 'diamond'
    WHEN NEW.total_earnings >= 2000 THEN 'gold'
    WHEN NEW.total_earnings >= 500 THEN 'silver'
    ELSE 'bronze'
  END INTO new_tier;
  
  IF new_tier != NEW.current_tier THEN
    UPDATE users SET tier = new_tier WHERE id = NEW.user_id;
    UPDATE user_stats SET current_tier = new_tier WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for tier upgrades
CREATE TRIGGER on_stats_updated_check_tier
  AFTER UPDATE ON user_stats
  FOR EACH ROW EXECUTE PROCEDURE check_tier_upgrade();
