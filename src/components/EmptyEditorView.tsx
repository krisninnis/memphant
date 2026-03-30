function EmptyEditorView() {
  return (
    <div className="project-panel">
      <h2 className="panel-title">✏️ Project Details</h2>

      <p className="meta-item editor-helper-text">
        You do not have a project open yet.
      </p>

      <ul className="info-list">
        <li>Create a new project from the left sidebar.</li>
        <li>Or open one of your saved projects.</li>
        <li>Then come back here to edit the project details.</li>
      </ul>
    </div>
  );
}

export default EmptyEditorView;
