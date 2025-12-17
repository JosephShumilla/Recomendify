from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import MinMaxScaler
import pandas as pd
from textblob import TextBlob

# Defines the columns that contain floats
audioCols = ['danceability', 'energy', 'loudness', 'speechiness', 'acousticness', 
             'instrumentalness', 'liveness', 'valence', 'tempo']

# Defines the OHE function that converts columns of categorical variables into a column for each differing categorical variable
def one_hot_encode(df, name, col):

  # Sets dummy columns
  encoded_df = pd.get_dummies(df[col])
  audio_feature_names = encoded_df.columns
  # Sets each column head to show "container of categorical variable|categorical variable"
  encoded_df.columns = [name + "|" + str(i) for i in audio_feature_names]
  encoded_df.reset_index(drop=True, inplace=True)
  return encoded_df


def select_columns(df):
  # Returns useful columns
  return df[['track_id', 'popularity','track_name', 'genre','danceability', 
             'energy', 'key', 'loudness', 'mode', 'speechiness', 'acousticness', 'instrumentalness', 
             'liveness', 'valence', 'tempo']]

# Defines function that uses an awesome library that numerizes the subjectivity of a given piece of text
def get_opinion(text):
  return TextBlob(text).sentiment.subjectivity # type: ignore

# Same function as above but gets the polarity instead of the subjectivity
def get_polarization(text):
  return TextBlob(text).sentiment.polarity # type: ignore

# Puts subjectivity and polarization into buckets
def get_magnitude(score, type):
  if type == 'polarization':
    if score < 0:
      return 'Negative'
    elif score == 0:
      return 'Neutral'
    else:
      return 'Positive'
  else:
    if score < 1/3:
      return 'low'
    elif score > 1/3:
      return 'high'
    else:
      return 'medium'

# Creates a new column in the given dataframe that holds the opinion and polarization scores for each row by a given column
def mood_analysis(df, col):
  df['opinion'] = df[col].apply(get_opinion).apply(lambda x : get_magnitude(x, 'opinion'))
  df['polarization'] = df[col].apply(get_polarization).apply(lambda x: get_magnitude(x, 'polarization'))
  return df

# Returns the total normalized features of a given dataframe with columns containing floats passed in
def get_total_features(df: pd.DataFrame, colsToScale: list) -> pd.DataFrame:
  features = []
  
  # Performs mood analysis on the track name of each row
  df = mood_analysis(df, 'track_name')

  # Performs OHE on each categorical variable column and assigns weights
  features.append(one_hot_encode(df, 'opinion', 'opinion') * 0.3)
  features.append(one_hot_encode(df, 'polarization', 'polarization') * 0.5)
  features.append(one_hot_encode(df, 'key', 'key') * 0.5)
  features.append(one_hot_encode(df, 'mode', 'key') * 0.5)
  features.append(one_hot_encode(df, 'genre', 'genre'))

  # Scales the popularity of each track and assigns weight to popularity
  popularity = df[['popularity']].reset_index(drop=True)
  scaler = MinMaxScaler()
  features.append(pd.DataFrame(scaler.fit_transform(popularity), columns = popularity.columns) * 0.2)

  # Scales the columns containing floats and assigns weights to them
  cols = df[colsToScale].reset_index(drop=True)
  features.append(pd.DataFrame(scaler.fit_transform(cols), columns = cols.columns) * 0.2)

  # Returns the concatenation of all of the feature columns
  totalFeatures = pd.concat(features, axis=1)
  totalFeatures['track_id'] = df['track_id'].values

  return totalFeatures

# Converts the given playlist into 1 row of each feature in the allFeatures dataframe, simply by summing every row up
def playlist_vectorizer(allFeatures: pd.DataFrame, normalizedPlaylist: pd.DataFrame):

  # Creates empty columns filled with zeroes for those columns present in allFeatures but not the given playlist
  normalizedPlaylist = normalizedPlaylist.reindex(columns=normalizedPlaylist.columns.union(
    allFeatures.columns, sort=False), fill_value=0)
  
  # Gets every song (with accompanying features) not included in the given playlist
  otherFeatures = allFeatures[~allFeatures['track_id'].isin(normalizedPlaylist['track_id'].values)]
  playlistNoID = normalizedPlaylist.drop(columns='track_id')

  # Same empty column process as above but the other way around
  otherFeatures = otherFeatures.reindex(columns=otherFeatures.columns.union(normalizedPlaylist.columns, sort=False), fill_value=0)

  return (playlistNoID.sum(axis=0), otherFeatures)

# Returns a dataframe containing the track id of every song not in the playlist but in the dataset with its accompanying similarity score
def get_similarities(dataset: pd.DataFrame, playlistVector, otherFeatures: pd.DataFrame):

  # Gets the tracks exclusive to the dataset
  dataset_exclusive = dataset[dataset['track_id'].isin(otherFeatures['track_id'].values)]

  # Reshapes the playlist vector from a 1 x n matrix to an n x 1 matrix so cosine similarity can be calculated
  reshapedPlaylist = playlistVector.values.reshape(1, -1)

  # Adds the similarity column that is populated with the similarity scores for every song in the exclusive dataset
  dataset_exclusive['similarity'] = cosine_similarity(otherFeatures.drop('track_id', axis=1).values
                                                      , reshapedPlaylist)[:,0]
  
  # Returns the concatenation of the exclusive track_ids with their corresponding similarity score
  return pd.concat([dataset_exclusive['track_id'], dataset_exclusive['similarity']], axis=1)

# Returns the similarity matrix for a given dataset and playlist
def generate_similarity_matrix(datasetFilePath: str, playlistArr) -> pd.DataFrame:

  # Converts the list of dictionaries to a dataframe
  playlistDF = pd.DataFrame(playlistArr)

  # Reads in the dataset
  dfDataset = pd.read_csv(datasetFilePath)

  # Trims down the unnecessary parts of the dataset
  dfDataset = select_columns(dfDataset)

  # Drops any rows that have any value of 'None' (yes, there was one song in the dataset called 'None' that threw everything off)
  dfDataset = dfDataset.dropna(subset='track_name')

  # Gets features of the dataset
  datasetFeatures = get_total_features(dfDataset, audioCols)

  # Same process as the dataset but for the playlist
  playlistDF = select_columns(playlistDF)
  playlistDF = playlistDF.dropna(subset='track_name')
  playlistFeatures = get_total_features(playlistDF, audioCols)

  # Vectorizes the playlist and gets the exclusive features of the dataset
  normalizedPlaylist, otherFeatures = playlist_vectorizer(datasetFeatures, playlistFeatures)

  # Gets the similarity matrix of of the two datasets
  simMatrix = get_similarities(dfDataset, normalizedPlaylist, otherFeatures)

  return simMatrix


