async function callApi(method, url, bodyData = null, csrfToken = '', media_upload = false) {
    try {
        if (typeof method !== 'string' || typeof url !== 'string') {
            throw new Error("Invalid method or URL");
        }

        let headers_data = {};

        if (media_upload) {
            headers_data = {
                ...(csrfToken && { 'X-CSRFToken': csrfToken }),
            };
        } else {
            headers_data = {
                'Content-Type': 'application/json',
                ...(csrfToken && { 'X-CSRFToken': csrfToken }),
            };
        }

        const options = {
            method: method.toUpperCase(),
            headers: headers_data,
        };

        if (method.toUpperCase() !== 'GET' && bodyData) {
            if (media_upload) {
                options.body = bodyData;
            } else {
                options.body = JSON.stringify(bodyData);
            }
        }

        const response = await fetch(url, options);

        try {
            const data = await response.json();
            return [true, data];
        } catch (error) {
            console.log('Error parsing JSON:', error);
            return [false, 'Invalid server response'];
        }

    } catch (error) {
        console.error("API Call Error:", error);
        return [false, error.message || "An unknown error occurred"];
    }
}

function toQueryString(params) {
    return Object.keys(params)
        .filter(key => params[key] !== null && params[key] !== undefined && params[key] !== '')
        .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
        .join('&');
}
