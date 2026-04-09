import { useProjectStore } from '../../store/projectStore';

export function TaskField() {
  const currentTask = useProjectStore((s) => s.currentTask);
  const setCurrentTask = useProjectStore((s) => s.setCurrentTask);

  return (
    <div className="task-field">
      <label className="task-field__label" htmlFor="task-field-input">
        What do you need help with?
      </label>
      <input
        id="task-field-input"
        type="text"
        className="task-field__input"
        placeholder="e.g. Fix the auth bug, Write the landing page copy…"
        value={currentTask}
        onChange={(e) => setCurrentTask(e.target.value)}
        maxLength={200}
      />
    </div>
  );
}

export default TaskField;
