import { CheckCircle2 } from "lucide-react";

export const Benefits = () => {
  const benefits = [
    {
      title: "Crushes inbox management",
      description: "Draft, triage, and file to Notion/CRM in one go",
    },
    {
      title: "Handles client research",
      description: "Pull context from CRM, notes, recent emails, and meetings",
    },
    {
      title: "Runs complete workflows",
      description: "Post → log → notify → follow-up, end to end",
    },
    {
      title: "Schedules meetings without the back-and-forth",
      description: "Propose times, book, and send prep in Slack",
    },
  ];

  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16">
            What Quik.day{" "}
            <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
              crushes
            </span>{" "}for you
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {benefits.map((benefit, index) => (
              <div 
                key={index}
                className="gradient-card rounded-2xl border border-border p-6 hover:shadow-lg transition-smooth"
              >
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <CheckCircle2 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-2">{benefit.title}</h3>
                    <p className="text-muted-foreground">{benefit.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
