from simulation import simulate_board

# Example usage for various board stages:
hero_hand = ['ad', 'ac', 'qd', 'jc', '2d']
villain_hand = ['as', '2c', '5c', '7s', '10s']

# No board cards
board=[]
print(f'board: {board}')
simulate_board(hero_hand, villain_hand, board)


# # Example usage for various board stages:
# hero_hand = ['ad', 'ac', 'qd', 'jc', 'jd']
# villain_hand = ['as', '2c', '9c', '9s', '10s']

# # No board cards
# board=[]
# print(f'board: {board}')
# simulate_board(hero_hand, villain_hand, board)