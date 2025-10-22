export const ProblemSolution = () => {
  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* Problem */}
          <p className="text-xl md:text-2xl text-muted-foreground mb-6 leading-relaxed">
            Too many tabs, too little focus. Switching between Slack, your CRM, email, 
            calendars, and docs wrecks momentum.
          </p>

          {/* Outcome */}
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
              Quik.day
            </span>{" "}
            plugs into your stack and executes—so you save time and stick to the work that matters.
          </h2>

          {/* Trust Note */}
          <p className="text-2xl md:text-3xl font-bold">
            No switching. No friction. No babysitting.
          </p>
        </div>
      </div>
    </section>
  );
};
