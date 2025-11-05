declare module 'openai' {
  export default class OpenAI {
    constructor(opts?: any);
    public chat: {
      completions: {
        create(opts: any, init?: any): Promise<any>;
      };
    };
  }
}
