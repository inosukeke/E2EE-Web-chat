//HTTP request
export const baseUrl = "http://localhost:5000/api";

export const postRequest = async (url, body) => {
  const response = await fetch(url, {
    //send request, get reponse object từ server, chứa status, headers, và body.

    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body), //////////
  });

  const data = await response.json();

  if (!response.ok) {
    let message;

    if (data?.message) {
      message = data.message; // get the message that we controlled, which has key message
    } else {
      message = data; // get the whole json
    }

    return { error: true, message };
  }

  return data;
};

export const getRequest = async (url) => {
  const response = await fetch(url);

  const data = await response.json();

  if (!response.ok) {
    let message = "An error occured";

    if (data?.message) {
      message = data.message;
    }
    return { error: true, message };
  }
  return data;
};
