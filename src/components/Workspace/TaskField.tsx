import { useProjectStore } from '../../store/projectStore';

export function TaskField() {
  const currentTask = useProjectStore((s) => s.currentTask);
  const setCurrentTask = useProjectStore((s) => s.setCurrentTask);

  return (
    <div className="task-field">
      <input
        type="text"
        className="task-field__input"
        placeholder="What should this AI focus on?"
        value={currentTask}
        onChange={(e) => setCurrentTask(e.target.value)}
      />
    </div>
  );
}

export default TaskField;
