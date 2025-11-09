"""
Supabase Helper Module
Provides utility functions to handle different Supabase client response formats
"""

def get_data(response):
    """
    Extract data from a Supabase response, handling both object and dict formats.
    
    Args:
        response: Supabase response (could be object with .data attribute or dict)
    
    Returns:
        The data from the response (list or dict), or None if no data
    """
    if response is None:
        return None
    
    # Check if response has a 'data' attribute (object format)
    if hasattr(response, 'data'):
        return response.data
    
    # Check if response is a dict with 'data' key
    if isinstance(response, dict) and 'data' in response:
        return response['data']
    
    # If neither, assume response itself is the data
    return response


def get_count(response):
    """
    Extract count from a Supabase response.
    
    Args:
        response: Supabase response
    
    Returns:
        The count value, or 0 if not found
    """
    if response is None:
        return 0
    
    # Check if response has a 'count' attribute
    if hasattr(response, 'count'):
        return response.count
    
    # Check if response is a dict with 'count' key
    if isinstance(response, dict) and 'count' in response:
        return response['count']
    
    return 0
