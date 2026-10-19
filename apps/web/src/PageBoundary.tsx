import React from "react";
export class PageBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <section className="panel" role="alert">
        <h2>Cette vue n’a pas pu être affichée</h2>
        <p>
          Vos données enregistrées sont conservées. Rechargez la vue ou revenez
          au tableau de bord.
        </p>
        <button onClick={() => location.reload()}>Recharger la vue</button>{" "}
        <a href="#page=dashboard">Revenir au tableau de bord</a>
      </section>
    ) : (
      this.props.children
    );
  }
}
