import json
import requests

def chat(base_url: str, api_key: str, model: str, messages: list[dict], timeout: int=60):
    url = f"{base_url.rstrip('/')}/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}", 
        "Content-Type": "application/json", 
    }
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
    }
    with requests.post(
        url,
        headers=headers,
        json=payload,
        stream=True,
        timeout=timeout,
    ) as resp:
        resp.raise_for_status()
        for raw_line in resp.iter_lines(decode_unicode=True):
            if not raw_line:
                continue
            if not raw_line.startswith("data: "):
                continue
            data_str = raw_line[len("data: "):]
            if data_str == "[DONE]":
                break
            event = json.loads(data_str)
            choice0 = event.get("choices", [{}])[0]
            delta = choice0.get("delta", {})
            piece = delta.get("content")
            if piece:
                yield piece

def main():
    print("There is Viper, a llm api assistant.")
    base_url = "https://api.deepseek.com"
    api_key = "sk-1eb44621942243aaa91984cd334f9b8e"
    model = "deepseek-chat"
    messages: list[dict] = [{"role": "system", "content": "You are a helpful assistant."}]
    while True:
        user_text = input("User: ").strip()
        if not user_text or user_text.lower() in {"/exit", "exit", "quit"}:
            break
        messages.append({"role": "user", "content": user_text})
        parts: list[str] = []
        print("Viper:", end="", flush=True)
        for piece in chat(base_url, api_key, model, messages):
            parts.append(piece)
            print(piece, end="", flush=True)
        assistant_text = "".join(parts)
        print()
        messages.append({"role": "assistant", "content": assistant_text})

if __name__ == "__main__":
    main()
