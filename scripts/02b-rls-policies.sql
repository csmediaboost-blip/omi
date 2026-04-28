-- Create ONLY tasks table RLS policies
CREATE POLICY "tasks_can_select_open"
  ON tasks
  FOR SELECT
  USING (status = 'open');

CREATE POLICY "tasks_can_select_own"
  ON tasks
  FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "tasks_can_insert"
  ON tasks
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);
